#!/usr/bin/env bash
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
  'secret inspect') [[ "${ALLOW_SECRET:-false}" == true ]] ;;
  *) echo 'Unexpected mutation before observability preflight passed' >&2; exit 1 ;;
esac
MOCK
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/flock"
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/mountpoint"
cat >"$fixture/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/data 134217728 1 134217727 1%% /var/lib/docker/tickif-telemetry\n'
MOCK
chmod +x "$fixture"/{docker,flock,mountpoint,df}
export DOCKER_CALLS="$fixture/calls" RELEASE_LOCK_FILE="$fixture/release.lock"
if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy-observability.sh "$fixture/env"; then
  echo 'Missing ingestion secret was accepted' >&2; exit 1
fi
export ALLOW_SECRET=true
if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy-observability.sh "$fixture/env"; then
  echo 'Unbounded telemetry filesystem was accepted' >&2; exit 1
fi
printf '\nSIGNOZ_OTLP_ENDPOINT=http://insecure.example\n' >>"$fixture/env"
if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy-observability.sh "$fixture/env"; then
  echo 'Insecure ingestion origin was accepted' >&2; exit 1
fi
! grep -Eq 'config create|network create|stack deploy|service scale|run ' "$DOCKER_CALLS"
echo 'Observability preflight rejects missing secrets, unbounded storage and insecure origin before deployment mutations.'
