#!/usr/bin/env bash
# Prove missing provider secrets abort before the release closes traffic.
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
  'secret inspect') [[ "$3" != tickif_staging_razorpay_webhook_secret_v1 ]] ;;
  *) echo "Unexpected Docker command before preflight completed: $*" >&2; exit 1 ;;
esac
MOCK
chmod +x "$fixture/docker"
printf '#!/usr/bin/env bash\nexit 0\n' >"$fixture/flock"
chmod +x "$fixture/flock"
export DOCKER_CALLS="$fixture/calls"
export RELEASE_LOCK_FILE="$fixture/release.lock"

if PATH="$fixture:$PATH" bash infra/staging/scripts/deploy.sh "$fixture/env"; then
  echo 'Deploy unexpectedly accepted a missing provider secret' >&2
  exit 1
fi
if grep -q 'service scale' "$DOCKER_CALLS"; then
  echo 'Deploy closed traffic before provider-secret preflight completed' >&2
  exit 1
fi
grep -q 'secret inspect tickif_staging_razorpay_webhook_secret_v1' "$DOCKER_CALLS"
echo 'Provider-secret preflight fails before traffic closes.'
