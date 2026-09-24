#!/usr/bin/env python3
"""Bounded image retention and disk preflight for the single staging manager.

Only removes immutable application tags, never volumes, containers, or images
referenced by a container or a current/previous Swarm service specification.
Call while holding the shared release/restore lock.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def docker(*args):
    result = subprocess.run(["docker", *args], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return result.stdout.strip()


def repository(ref):
    name = ref.split("@", 1)[0]
    return name.rsplit(":", 1)[0] if ":" in name.rsplit("/", 1)[-1] else name


def release_tag(ref):
    tag = ref.split("@", 1)[0].rsplit(":", 1)[-1]
    return tag if re.fullmatch(r"[0-9a-f]{40,64}", tag) else None


def removal_candidates(images, repositories, protected_refs, protected_ids, retain):
    groups = {}
    protected_releases = {release_tag(ref.split("@", 1)[0]) for ref in protected_refs}
    protected_releases.discard(None)
    for image in images:
        refs = set(image.get("RepoTags") or []) | set(image.get("RepoDigests") or [])
        if refs & protected_refs:
            protected_ids.add(image["Id"])
        for tag in image.get("RepoTags") or []:
            sha = release_tag(tag)
            repo = repository(tag)
            if repo not in repositories or not sha:
                continue
            group = groups.setdefault(sha, {"repos": set(), "created": "", "tags": []})
            group["repos"].add(repo)
            group["created"] = max(group["created"], image["Created"])
            group["tags"].append((tag, image["Id"]))
            if image["Id"] in protected_ids:
                protected_releases.add(sha)
    complete = sorted((sha for sha, group in groups.items()
                       if group["repos"] == repositories and sha not in protected_releases),
                      key=lambda sha: groups[sha]["created"], reverse=True)
    keep = protected_releases | set(complete[:retain])
    return sorted({tag for sha, group in groups.items() if sha not in keep
                   for tag, image_id in group["tags"] if image_id not in protected_ids})


def inspect_many(kind, ids):
    if kind == "container":
        containers = []
        for container_id in ids:
            try:
                containers.extend(json.loads(docker(kind, "inspect", container_id)))
            except subprocess.CalledProcessError as error:
                # Swarm can remove stopped tasks between listing and inspection.
                # Docker can also list an already-removed dead task after restart.
                if "No such container:" not in (error.stderr or ""):
                    raise
        return containers
    return json.loads(docker(kind, "inspect", *ids)) if ids else []


def remove_image(ref):
    try:
        docker("image", "rm", ref)  # Never force or prune volumes.
    except subprocess.CalledProcessError as error:
        # Docker 29 can report both a tag and a tag@digest alias for one image.
        # Removing the tag may remove the alias too. Other errors remain fatal.
        if "No such image:" not in (error.stderr or ""):
            raise


def prune(refs, retain, dry_run=False):
    repositories = {repository(ref) for ref in refs}
    images = inspect_many("image", sorted(set(docker("image", "ls", "-q", "--no-trunc").split())))
    containers = inspect_many("container", docker("container", "ls", "-aq").split())
    services = inspect_many("service", docker("service", "ls", "-q").split())
    protected_refs = set(refs)
    for service in services:
        for key in ("Spec", "PreviousSpec"):
            ref = service.get(key, {}).get("TaskTemplate", {}).get("ContainerSpec", {}).get("Image")
            if ref:
                protected_refs.add(ref)
                protected_refs.add(ref.split("@", 1)[0])
    candidates = removal_candidates(images, repositories, protected_refs,
                                    {container["Image"] for container in containers}, retain)
    print(f"[storage] retaining {retain} complete rollback releases plus referenced releases; removing {len(candidates)} old tags", flush=True)
    for ref in candidates:
        print(f"[storage] {'would remove' if dry_run else 'removing'} {ref}", flush=True)
        if not dry_run:
            remove_image(ref)


def positive_env(name, default):
    value = int(os.environ.get(name, default))
    if value < 1:
        raise ValueError(f"{name} must be positive")
    return value


def check_space():
    image_path = Path(os.environ.get("CONTAINERD_STORAGE_PATH", "/var/lib/containerd"))
    docker_path = Path(docker("info", "--format", "{{.DockerRootDir}}"))
    paths = [(Path("/"), positive_env("MIN_ROOT_FREE_GIB", 2)),
             (docker_path, positive_env("MIN_IMAGE_FREE_GIB", 10)),
             (image_path, positive_env("MIN_IMAGE_FREE_GIB", 10))]
    min_inodes = positive_env("MIN_FREE_INODES", 100000)
    for path, minimum in paths:
        usage = os.statvfs(path)
        available = usage.f_bavail * usage.f_frsize
        print(f"[storage] {path}: {available / 1024**3:.1f} GiB free; {usage.f_favail} free inodes", flush=True)
        if available < minimum * 1024**3 or usage.f_favail < min_inodes:
            raise RuntimeError(f"Insufficient space at {path}: require {minimum} GiB and {min_inodes} free inodes; traffic unchanged")


def prepare(refs, retain):
    prune(refs, retain)
    check_space()
    for ref in refs:
        print(f"[storage] pulling {ref} before closing traffic", flush=True)
        docker("pull", ref)
        check_space()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "prune", "check"))
    parser.add_argument("images", nargs="+")
    parser.add_argument("--retain", type=int, default=positive_env("IMAGE_ROLLBACK_RELEASES", 3))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.retain < 1:
        parser.error("retain must be positive")
    if any(not release_tag(ref) and not re.search(r"@sha256:[0-9a-f]{64}$", ref) for ref in args.images):
        parser.error("images require a full commit SHA or digest")
    if args.dry_run and args.action != "prune":
        parser.error("dry-run applies only to prune")
    if args.action == "prepare":
        prepare(args.images, args.retain)
    elif args.action == "prune":
        prune(args.images, args.retain, args.dry_run)
    else:
        check_space()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"[storage] {error}", file=sys.stderr)
        sys.exit(1)
