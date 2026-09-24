#!/usr/bin/env bash
# Exercise migration refusal paths without root or a Docker daemon.
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
export fixture
mkdir "$fixture/source"
touch "$fixture/lock"
# Redirect host paths and omit only the root-user gate in the disposable copy.
sed -e '/^\[\[ "\$EUID" == 0 \]\]/d' \
  -e 's|^exec 9<.*|exec 9<"$fixture/lock"|' \
  -e 's|^source_dir=.*|source_dir="$fixture/source"|' \
  -e 's|^target_dir=.*|target_dir="$fixture/target"|' \
  -e 's|^backup_dir=.*|backup_dir="$fixture/backup"|' \
  -e 's|^record_dir=.*|record_dir="$fixture"|' \
  infra/staging/scripts/migrate-containerd-storage.sh >"$fixture/migrate.sh"

for scenario in mounted shim; do
  export scenario
  if bash -c '
    flock() { return 0; }
    mountpoint() { [[ "$2" == /var/lib/docker || "$scenario" == mounted ]]; }
    stat() { [[ "$3" == / ]] && echo 1 || echo 2; }
    df() { echo 99999999999; }
    docker() {
      case "$1 $2" in
        "node ls") echo node ;;
        "service inspect") echo 0 ;;
        "service scale") echo scale >>"$fixture/calls" ;;
        "stack services"|"ps -q"|"ps -aq") return 0 ;;
        *) return 1 ;;
      esac
    }
    install() { return 0; }
    systemctl() { return 0; }
    pgrep() { [[ "$scenario" == shim ]]; }
    findmnt() { return 0; }
    rsync() { echo copy >>"$fixture/calls"; return 99; }
    source "$fixture/migrate.sh"
  ' >"$fixture/output" 2>&1; then
    echo "Migration unexpectedly accepted $scenario" >&2
    exit 1
  fi
  if [[ "$scenario" == mounted ]]; then
    grep -q 'already mounted' "$fixture/output"
    [[ ! -e "$fixture/calls" ]]
  else
    grep -q 'Containerd shims remain' "$fixture/output"
    ! grep -q copy "$fixture/calls"
  fi
done
echo 'Migration refuses mounted source and live containerd shims before copying.'
