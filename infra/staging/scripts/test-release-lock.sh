#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
chmod 1777 "$fixture"
export RELEASE_LOCK_LIBRARY="$PWD/infra/staging/scripts/lib.sh"
export RELEASE_LOCK_FILE="$fixture/existing.lock"
printf '%s' lock-inode-must-survive >"$RELEASE_LOCK_FILE"
chmod 0644 "$RELEASE_LOCK_FILE"
# Root disposable-container execution reproduces a different operator owning
# the lock in a sticky directory, as on Ubuntu's protected /var/lock.
if [[ "$(id -u)" == 0 ]]; then chown 10001:10001 "$RELEASE_LOCK_FILE"; fi
bash -eu -c 'source "$RELEASE_LOCK_LIBRARY"; acquire_release_lock'
[[ "$(cat "$RELEASE_LOCK_FILE")" == lock-inode-must-survive ]]

# A competing release must use the same existing inode and remain excluded.
source "$RELEASE_LOCK_LIBRARY"
acquire_release_lock
if bash -eu -c 'source "$RELEASE_LOCK_LIBRARY"; acquire_release_lock'; then
  echo 'Competing release bypassed the held lock' >&2; exit 1
fi
exec 9<&-

# First-time root/user callers can both read a lock created under a secure umask.
export RELEASE_LOCK_FILE="$fixture/new.lock"
bash -eu -c 'umask 077; source "$RELEASE_LOCK_LIBRARY"; acquire_release_lock'
[[ "$(stat -c '%a' "$RELEASE_LOCK_FILE")" == 644 ]]
[[ ! -s "$RELEASE_LOCK_FILE" ]]
echo 'Release locking preserves existing operator-owned inode, excludes concurrent releases and safely creates new locks.'
