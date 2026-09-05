#!/usr/bin/env bash
# Exercise restore failure handling without touching Docker or a database.
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
cp infra/staging/.env.example "$fixture/env"
cat >"$fixture/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_CALLS"
case "$1 $2" in
  'info --format') [[ "$3" == *ControlAvailable* ]] && echo true || echo node ;;
  'node ls') echo node ;;
  'node inspect') echo true ;;
  'service inspect')
    [[ "$3" == *_restore_* ]] && exit 1
    case "$3" in *_api) echo 3 ;; *_web) echo 2 ;; *) echo 1 ;; esac
    ;;
  'service scale') ;;
  'service create') exit 1 ;;
  'ps -q') ;;
  *) echo "Unexpected Docker command in fixture: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x "$fixture/docker"
# The fixture tests recovery control flow; OS advisory locking is not under test.
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/flock"
chmod +x "$fixture/flock"
export DOCKER_CALLS="$fixture/calls"
export RELEASE_LOCK_FILE="$fixture/release.lock"
if PATH="$fixture:$PATH" bash infra/staging/scripts/restore.sh --confirm tickif postgres/synthetic.dump.age "$fixture/env"; then
  echo 'Failed restore unexpectedly succeeded' >&2; exit 1
fi
for service in traefik api web worker; do
  grep -q "service scale --detach=true tickif_$service=0" "$DOCKER_CALLS"
done
if grep -Eq 'service scale .*=[1-9]' "$DOCKER_CALLS"; then
  echo 'Failed restore resumed traffic' >&2; exit 1
fi
echo 'Failed restore stays closed; no replica resume on EXIT.'
