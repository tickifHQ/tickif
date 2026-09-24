#!/usr/bin/env python3
"""Storage regression tests; no Docker daemon or live filesystem mutations."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import subprocess
import sys
from types import SimpleNamespace

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("storage", Path(__file__).with_name("storage.py"))
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageTests(unittest.TestCase):
    def test_container_disappearing_during_inspection_is_safe(self):
        missing = subprocess.CalledProcessError(1, ["docker"], stderr="Error response from daemon: No such container: removed")
        with patch.object(storage, "docker", side_effect=[missing, '[{"Image":"still-protected"}]']):
            self.assertEqual(storage.inspect_many("container", ["removed", "present"]), [{"Image": "still-protected"}])
        failure = subprocess.CalledProcessError(1, ["docker"], stderr="Cannot connect to Docker daemon")
        with patch.object(storage, "docker", side_effect=failure):
            with self.assertRaises(subprocess.CalledProcessError):
                storage.inspect_many("container", ["present"])

    def test_checks_root_and_both_image_storage_filesystems(self):
        roomy = SimpleNamespace(f_bavail=20 * 1024**3, f_frsize=1, f_favail=200000)
        full = SimpleNamespace(f_bavail=1024**3, f_frsize=1, f_favail=200000)
        for position in range(3):
            readings = [roomy, roomy, roomy]
            readings[position] = full
            with patch.dict(storage.os.environ, {}, clear=True), patch.object(storage, "docker", return_value="/var/lib/docker"), patch.object(storage.os, "statvfs", side_effect=readings, create=True):
                with self.assertRaisesRegex(RuntimeError, "Insufficient space"):
                    storage.check_space()

    def test_inode_exhaustion_is_rejected_with_bytes_available(self):
        usage = SimpleNamespace(f_bavail=20 * 1024**3, f_frsize=1, f_favail=5)
        with patch.dict(storage.os.environ, {}, clear=True), patch.object(storage, "docker", return_value="/var/lib/docker"), patch.object(storage.os, "statvfs", return_value=usage, create=True):
            with self.assertRaisesRegex(RuntimeError, "free inodes"):
                storage.check_space()

    def test_removal_tolerates_alias_removed_with_previous_tag(self):
        missing = subprocess.CalledProcessError(1, ["docker"], stderr="Error response from daemon: No such image: alias")
        with patch.object(storage, "docker", side_effect=missing):
            storage.remove_image("alias")
        conflict = subprocess.CalledProcessError(1, ["docker"], stderr="conflict: container uses image")
        with patch.object(storage, "docker", side_effect=conflict):
            with self.assertRaises(subprocess.CalledProcessError):
                storage.remove_image("in-use")

    def test_swarm_tag_plus_digest_references(self):
        refs = [f"registry:5000/repo/api:{n:040x}@sha256:{n:064x}" for n in (1, 2)]
        images = [{"Id": ref, "Created": str(n), "RepoTags": [ref]} for n, ref in enumerate(refs)]
        self.assertEqual(storage.repository(refs[0]), "registry:5000/repo/api")
        self.assertEqual(storage.removal_candidates(images, {"registry:5000/repo/api"}, set(), set(), 1), [refs[0]])

    def test_retains_complete_rollbacks_and_protected_releases(self):
        images = []
        repositories = {f"ghcr.io/example/tickif-{name}" for name in ("api", "web", "worker", "operations")}
        for release in range(1, 7):
            for repo in repositories:
                images.append({"Id": f"{repo}-{release}", "Created": f"2026-09-{release:02}",
                               "RepoTags": [f"{repo}:{release:040x}"]})
        # A partial newer download must not evict a complete rollback release.
        images.append({"Id": "partial", "Created": "2026-09-09",
                       "RepoTags": [f"ghcr.io/example/tickif-api:{9:040x}"]})
        protected = {f"ghcr.io/example/tickif-api:{1:040x}"}
        candidates = storage.removal_candidates(images, repositories, protected, set(), 3)
        self.assertEqual(len(candidates), 9)  # releases 2, 3 and partial 9
        self.assertFalse(any(tag.endswith(f":{1:040x}") for tag in candidates))
        self.assertFalse(any(tag.endswith(f":{6:040x}") for tag in candidates))

    def test_container_ids_and_unrelated_images_are_never_removed(self):
        images = [{"Id": "in-use", "Created": "old", "RepoTags": [f"repo/api:{1:040x}"]},
                  {"Id": "other", "Created": "old", "RepoTags": [f"other/api:{1:040x}"]}]
        self.assertEqual(storage.removal_candidates(images, {"repo/api"}, set(), {"in-use"}, 1), [])

    def test_disk_full_prevents_any_pull(self):
        with patch.object(storage, "prune"), patch.object(storage, "check_space", side_effect=RuntimeError("disk full")), patch.object(storage, "docker") as docker:
            with self.assertRaisesRegex(RuntimeError, "disk full"):
                storage.prepare([f"repo/api:{1:040x}"], 3)
            docker.assert_not_called()

    def test_pull_failure_stops_preparation(self):
        with patch.object(storage, "prune"), patch.object(storage, "check_space"), patch.object(storage, "docker", side_effect=RuntimeError("pull failed")) as docker:
            with self.assertRaisesRegex(RuntimeError, "pull failed"):
                storage.prepare([f"repo/api:{1:040x}", f"repo/web:{1:040x}"], 3)
            self.assertEqual(docker.call_count, 1)


if __name__ == "__main__":
    unittest.main()
