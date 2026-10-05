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
  'run --rm')
    [[ "${ALLOW_VALIDATION:-false}" == true && " $* " == *' --network none '* ]]
    [[ " $* " != *' --user 0'* ]]
    for argument in "$@"; do
      if [[ "$argument" == *'target=/run/secrets/signoz_ingestion_key'* ]]; then
        secret_file=${argument#*source=}; secret_file=${secret_file%%,*}
        # Git Bash's stat reports NTFS ACLs rather than Linux chmod bits. The
        # Linux execution/CI checks the real mode; Docker Desktop maps it.
        if ! command -v cygpath >/dev/null; then
          [[ "$(stat -c '%a' "$secret_file")" == 644 ]] || {
            echo 'Unprivileged validator cannot read the synthetic key under restrictive umask' >&2; exit 1;
          }
        fi
        printf 'validated-readable-synthetic-key\n' >>"$DOCKER_CALLS"
      fi
    done ;;
  *) echo 'Unexpected mutation before observability preflight passed' >&2; exit 1 ;;
esac
MOCK
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/flock"
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/mountpoint"
cat >"$fixture/df" <<'MOCK'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/data %s 1 10 1%% /var/lib/docker/tickif-telemetry\n' "${MOCK_STORAGE_KIB:-134217728}"
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
export MOCK_STORAGE_KIB=983040
printf '\nTELEMETRY_STORAGE_PATH=/var/lib/docker/tickif-missing-preflight-%s-%s\n' "$$" "$RANDOM" >>"$fixture/env"
if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy-observability.sh "$fixture/env"; then
  echo 'Missing collector child directory was accepted' >&2; exit 1
fi
printf '\nSIGNOZ_OTLP_ENDPOINT=http://insecure.example\n' >>"$fixture/env"
if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy-observability.sh "$fixture/env"; then
  echo 'Insecure ingestion origin was accepted' >&2; exit 1
fi
! grep -Eq 'config create|network create|stack deploy|service scale|run ' "$DOCKER_CALLS"
echo 'Observability preflight rejects missing secrets, unbounded storage, absent collector child and insecure origin before deployment mutations.'

# Exercise the actual production validation section under the secure operator
# umask. Docker is mocked; this never reads a real key or contacts SigNoz.
awk '/^scratch=/ {emit=1} /^collector_hash=/ {emit=0} emit' \
  infra/staging/scripts/deploy-observability.sh >"$fixture/validate.sh"
export ALLOW_VALIDATION=true observability_dir="$PWD/infra/staging/observability"
export collector_image=otel/opentelemetry-collector-contrib:fixture proxy_image=haproxy:fixture
export SIGNOZ_OTLP_ENDPOINT=https://ingest.in2.signoz.cloud:443
PATH="$fixture:$PATH" bash -eu -c 'umask 077; source "$1"' -- "$fixture/validate.sh"
grep -q '^validated-readable-synthetic-key$' "$DOCKER_CALLS"
echo 'Synthetic collector validation preserves the unprivileged image user and works under umask 077.'
