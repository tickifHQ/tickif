#!/usr/bin/env bash
# Exercise the workflow's actual remote script with fake registry/deploy commands.
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
export AUTH_FIXTURE="$fixture"
mkdir -p "$fixture/bin" "$fixture/tmp" "$fixture/staging" "$fixture/payload/infra/staging/scripts"
printf 'host credential remains unchanged\n' > "$fixture/host-config"
touch "$fixture/staging/staging.env"
sha=0123456789012345678901234567890123456789

{ printf 'set -e\n'; sed -n '/^          \[\[ "\$RELEASE_SHA"/,/^          remote_script=/p' \
    .github/workflows/staging-deploy.yml | sed '$d'; } > "$fixture/validate.sh"
export RELEASE_SHA="$sha" IMAGE_REPOSITORY=TickifHQ/tickif
for actor in test-actor 'dependabot[bot]'; do
  GHCR_USERNAME="$actor" bash "$fixture/validate.sh"
done
for actor in 'bad actor' 'actor;false' "actor'"; do
  if GHCR_USERNAME="$actor" bash "$fixture/validate.sh"; then
    echo 'Unsafe remote username accepted' >&2; exit 1
  fi
done
if GHCR_USERNAME=test-actor IMAGE_REPOSITORY="owner/repo';false" bash "$fixture/validate.sh"; then
  echo 'Unsafe remote repository accepted' >&2; exit 1
fi
if GHCR_USERNAME=test-actor RELEASE_SHA='bad;false' bash "$fixture/validate.sh"; then
  echo 'Unsafe remote SHA accepted' >&2; exit 1
fi

cat > "$fixture/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$*" == 'login ghcr.io --username test-actor --password-stdin' ]]
[[ -n "$DOCKER_CONFIG" && "$DOCKER_CONFIG" != "$AUTH_FIXTURE/host-config" ]]
[[ "$(stat -c %a "$DOCKER_CONFIG")" == 700 ]]
printf '%s\n' "$DOCKER_CONFIG" > "$AUTH_FIXTURE/config-path"
IFS= read -r token
[[ "$token" == synthetic-registry-token ]]
[[ "${LOGIN_FAIL:-false}" != true ]] || exit 17
printf 'temporary auth\n' > "$DOCKER_CONFIG/config.json"
MOCK
cat > "$fixture/payload/infra/staging/scripts/deploy.sh" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ -f "$DOCKER_CONFIG/config.json" ]]
[[ -f "$1" ]]
grep -q '^API_IMAGE=ghcr.io/tickifhq/tickif-api:' "$1"
printf 'deploy reached\n' > "$AUTH_FIXTURE/deployed"
[[ "${DEPLOY_FAIL:-false}" != true ]] || exit 23
MOCK
chmod +x "$fixture/bin/docker"
export PATH="$fixture/bin:$PATH"

for scenario in success login-failure deploy-failure; do
  # Extract the literal heredoc instead of maintaining a second implementation.
  awk '/<<\047REMOTE\047$/ { copy=1; next } copy && /^          REMOTE$/ { exit } copy { sub(/^          /, ""); print }' \
    .github/workflows/staging-deploy.yml > "$fixture/remote-source"
  test -s "$fixture/remote-source"
  sed -e "s|/opt/tickif|$fixture/staging|g" -e "s|/tmp/tickif|$fixture/tmp/tickif|g" \
    "$fixture/remote-source" > "$fixture/remote.sh"
  tar -czf "$fixture/tmp/tickif-${sha}.tar.gz" -C "$fixture/payload" infra/staging
  rm -f "$fixture/deployed" "$fixture/config-path"
  export LOGIN_FAIL=false DEPLOY_FAIL=false
  [[ "$scenario" != login-failure ]] || LOGIN_FAIL=true
  [[ "$scenario" != deploy-failure ]] || DEPLOY_FAIL=true
  code=0
  printf '%s\n' synthetic-registry-token | bash "$fixture/remote.sh" "$sha" TickifHQ/tickif test-actor || code=$?
  case "$scenario" in
    success) [[ "$code" == 0 && -f "$fixture/deployed" ]] ;;
    login-failure) [[ "$code" == 17 && ! -e "$fixture/deployed" ]] ;;
    deploy-failure) [[ "$code" == 23 && -f "$fixture/deployed" ]] ;;
  esac
  [[ ! -d "$(cat "$fixture/config-path")" ]]
  [[ ! -e "$fixture/remote.sh" ]]
  [[ -z "$(find "$fixture/tmp" -name 'tickif-staging.*' -print)" ]]
  grep -qx 'host credential remains unchanged' "$fixture/host-config"
  echo "Registry auth: $scenario cleans credentials and preserves host login."
done
