#!/usr/bin/env bash
# One-time, root-only migration for the documented staging host layout.
# Requires an intentional maintenance window; run retention first.
set -Eeuo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run as root' >&2; exit 1; }
# Open the existing deploy-user lock read-only: Ubuntu protects files owned by
# another user in sticky /var/lock from root O_CREAT/truncation opens.
exec 9</var/lock/tickif-staging-release.lock
flock -n 9 || { echo 'Another release/restore is running' >&2; exit 1; }
source_dir=/var/lib/containerd
target_dir=/var/lib/docker/containerd-store
backup_dir=/var/lib/containerd.root-backup
record_dir=/opt/tickif/storage-migration
mountpoint -q /var/lib/docker
[[ "$(stat -c %d /var/lib/docker)" != "$(stat -c %d /)" ]]
[[ -d "$source_dir" && ! -L "$source_dir" && ! -e "$backup_dir" && ! -e "$target_dir" ]]
! mountpoint -q "$source_dir"
[[ "$(df -B1 --output=avail /var/lib/docker | tail -1)" -gt 21474836480 ]]
command -v rsync >/dev/null
[[ "$(docker node ls -q | wc -l)" -eq 1 ]]
for service in traefik api web worker; do
  [[ "$(docker service inspect "tickif_$service" --format '{{.Spec.Mode.Replicated.Replicas}}')" == 0 ]] || {
    echo 'Close staging traffic and writers before migration' >&2; exit 1;
  }
done
install -d -m 700 "$record_dir"
docker stack services tickif --format '{{.Name}} {{.Replicas}}' >"$record_dir/services-before.txt"
for service in postgres redis typesense socket-proxy; do
  docker service scale --detach=true "tickif_$service=0"
done
deadline=$((SECONDS + 180))
while [[ -n "$(docker ps -q)" || -n "$(docker ps -aq --filter label=com.docker.stack.namespace=tickif)" ]]; do
  (( SECONDS < deadline )) || { echo 'Containers or stopped Swarm tasks remain; migration aborted' >&2; exit 1; }
  sleep 2
done
systemctl stop docker.socket docker.service containerd.service
! pgrep -f '^/usr/bin/containerd-shim' >/dev/null
if findmnt -rn -o TARGET | grep -q '^/var/lib/containerd/'; then
  echo 'Container mounts remain; refusing copy' >&2; exit 1
fi
install -d -m 700 "$target_dir"
echo '[storage] copying containerd onto the data disk'
rsync -aHAX --numeric-ids --info=stats2 "$source_dir/" "$target_dir/"
echo '[storage] verifying copied content and metadata'
rsync -aHAXnc --numeric-ids --itemize-changes "$source_dir/" "$target_dir/" >"$record_dir/copy-verification.txt"
[[ ! -s "$record_dir/copy-verification.txt" ]] || { echo 'Copy verification failed' >&2; exit 1; }
# Retain the source until the restarted services and release have been verified.
mv -- "$source_dir" "$backup_dir"
install -d -m 700 "$source_dir"
cat >/etc/systemd/system/var-lib-containerd.mount <<'UNIT'
[Unit]
Description=Containerd image storage on the staging data disk
Requires=var-lib-docker.mount
After=var-lib-docker.mount
Before=containerd.service docker.service

[Mount]
What=/var/lib/docker/containerd-store
Where=/var/lib/containerd
Type=none
Options=bind

[Install]
WantedBy=local-fs.target
UNIT
for service in containerd docker; do
  install -d -m 755 "/etc/systemd/system/$service.service.d"
  cat >"/etc/systemd/system/$service.service.d/storage.conf" <<'UNIT'
[Unit]
RequiresMountsFor=/var/lib/docker /var/lib/containerd
UNIT
done
systemctl daemon-reload
systemctl enable --now var-lib-containerd.mount
[[ "$(stat -c %d "$source_dir")" == "$(stat -c %d "$target_dir")" ]]
systemctl start containerd.service docker.service
docker info --format '{{.Swarm.LocalNodeState}}'
echo "[storage] migrated; source retained at $backup_dir until release verification"
df -h / /var/lib/containerd /var/lib/docker
