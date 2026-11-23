#!/usr/bin/env bash
# Reviewed maintenance release: migrations first, no seeds, no public ingress.
set -Eeuo pipefail
PRODUCTION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "${1:-}" == --apply-reviewed ]] || { echo 'Use --apply-reviewed after reviewing the release'; exit 1; }
[[ "$EUID" == 0 ]] || { echo 'Run on the production manager as root'; exit 1; }
set -a
source "${2:-/opt/tickif/production/runtime.env}"
set +a
[[ "$STACK_NAME" == tickif-production && "$PRODUCTION_HOST" == tickif.com ]] || exit 1
token=$(curl -fsS --max-time 3 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
instance=$(curl -fsS --max-time 3 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/instance-id)
unset token
[[ "$instance" == i-0c4119452058c9434 ]] || { echo 'Wrong EC2 host'; exit 1; }
[[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" == true && "$(docker node ls -q | wc -l)" == 1 ]] || exit 1
lock=/var/lock/tickif-production-release.lock
if [[ ! -e "$lock" ]]; then (umask 022; set -o noclobber; : >"$lock") 2>/dev/null || true; fi
[[ -f "$lock" && ! -L "$lock" ]] || { echo 'Release lock must be a regular file'; exit 1; }
exec 9<"$lock"
flock -n 9 || { echo 'Another production release is running'; exit 1; }
[[ "$RELEASE_COMMIT" =~ ^[a-f0-9]{40}$ && "$RELEASE_VERSION" =~ ^v0\.1\.[0-9]+$ ]] || exit 1
# Leave space for the running release while Docker downloads/unpacks layers.
[[ "$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')" -ge 10485760 ]] || { echo 'Need 10 GiB free before pulling release images'; exit 1; }
for service in API WEB WORKER OPERATIONS; do
  variable="${service}_IMAGE"; image="${!variable}"
  [[ "$image" =~ ^ghcr.io/tickifhq/tickif-${service,,}@sha256:[a-f0-9]{64}$ ]] || exit 1
  docker pull "$image" >/dev/null
  [[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$RELEASE_COMMIT" ]] || { echo 'Image revision mismatch'; exit 1; }
  [[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" == "$RELEASE_VERSION" ]] || { echo 'Image release version mismatch'; exit 1; }
  [[ "$(docker image inspect "$image" --format '{{index .Config.Labels "com.tickif.deployment"}}')" == production ]] || { echo 'Image is not a main production build'; exit 1; }
done
# No automatic pruning on the small production disk; retain rollback images.
[[ "$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')" -ge 5242880 ]] || { echo 'Need 5 GiB free after pulling images'; exit 1; }
docker node update --label-add tickif.stateful=true "$(docker info --format '{{.Swarm.NodeID}}')" >/dev/null
export API_REPLICAS=0 WEB_REPLICAS=0 WORKER_REPLICAS=0
compose=(-c "$PRODUCTION_DIR/stack.yml")
if [[ "$BILLING_READY" == true ]]; then compose+=(-c "$PRODUCTION_DIR/billing.yml"); fi
docker stack config "${compose[@]}" >/dev/null
close_writers() {
  for service in traefik api web worker; do
    if docker service inspect "${STACK_NAME}_$service" >/dev/null 2>&1; then
      docker service scale --detach=true "${STACK_NAME}_$service=0" >/dev/null
    fi
  done
}
wait_healthy() {
  local service="$1" deadline=$((SECONDS + 600)) count id
  while ((SECONDS < deadline)); do
    count=0
    while read -r id; do
      [[ -z "$id" ]] && continue
      if [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" == healthy ]]; then count=$((count+1)); fi
    done < <(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_$service")
    [[ "$count" == 1 ]] && return 0
    sleep 3
  done
  echo "Readiness failed: $service" >&2; return 1
}
finish() {
  code=$?
  if [[ -n "${active_job:-}" ]]; then docker service rm "$active_job" >/dev/null 2>&1 || true; fi
  if ((code != 0)); then close_writers || true; echo 'Release failed; writers and ingress remain closed' >&2; fi
}
trap finish EXIT
close_writers
deadline=$((SECONDS + 240))
while :; do
  running=''
  for service in api web worker traefik; do running+=$(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_$service"); done
  [[ -z "$running" ]] && break
  ((SECONDS < deadline)) || { echo 'Writers did not stop'; exit 1; }
  sleep 2
done
# Do not prune services from the optional ingress overlay here.
docker stack deploy --with-registry-auth "${compose[@]}" "$STACK_NAME"
wait_healthy typesense
job() {
  local purpose="$1" secret="$2"; shift 2
  local -a search_secrets=()
  if [[ "$purpose" == search ]]; then
    search_secrets+=(--secret "source=$TYPESENSE_ADMIN_KEY_SECRET,target=typesense_admin_key,uid=1001,gid=1001,mode=0400")
    search_secrets+=(--secret "source=$TYPESENSE_SEARCH_KEY_SECRET,target=typesense_search_key,uid=1001,gid=1001,mode=0400")
  fi
  active_job="tickif-production-${purpose}-$(date +%s)-$RANDOM"
  docker service create --detach=true --name "$active_job" --mode replicated-job \
    --replicas 1 --restart-condition none --no-healthcheck --with-registry-auth \
    --constraint node.role==manager --network tickif_production_backend \
    --read-only --cap-drop ALL --mount type=tmpfs,destination=/tmp \
    --limit-memory 768m --limit-cpu 1 \
    --config "source=$RDS_CA_CONFIG,target=/etc/tickif/rds-ca.pem,mode=0444" \
    --secret "source=$secret,target=app_config,uid=1001,gid=1001,mode=0400" \
    "${search_secrets[@]}" \
    --env NODE_ENV=production --env DEPLOYMENT_ENV=production --env TELEMETRY_ENABLED=false \
    --env CONFIG_SECRETS_FILE=/run/secrets/app_config --env NODE_EXTRA_CA_CERTS=/etc/tickif/rds-ca.pem \
    --env BETTER_AUTH_URL=https://tickif.com --env PUBLIC_WEB_URL=https://tickif.com \
    --env TYPESENSE_HOST=http://typesense:8108 --env TYPESENSE_COLLECTION_PREFIX=tickif_production \
    --env "R2_ENDPOINT=$R2_ENDPOINT" --env "R2_BUCKET=$R2_BUCKET" \
    "$OPERATIONS_IMAGE" -ec "$*" >/dev/null
  local deadline=$((SECONDS + 900)) states
  while ((SECONDS < deadline)); do
    states=$(docker service ps "$active_job" --format '{{.CurrentState}}')
    if grep -Eq 'Failed|Rejected' <<<"$states"; then echo "$purpose failed; inspect restricted service logs" >&2; return 1; fi
    if grep -q '^Complete' <<<"$states"; then
      docker service rm "$active_job" >/dev/null; active_job=''; return 0
    fi
    sleep 3
  done
  echo "$purpose timed out" >&2; return 1
}
job migrate "$MIGRATION_CONFIG_SECRET" 'pnpm --filter @repo/db migrate'
job search "$WORKER_CONFIG_SECRET" 'pnpm --filter @repo/search bootstrap && node infra/production/register-search-key.mjs'
for service in api web worker; do
  docker service scale --detach=true "${STACK_NAME}_$service=1" >/dev/null
  wait_healthy "$service"
done
umask 077
printf '%s %s\n' "$RELEASE_VERSION" "$RELEASE_COMMIT" >/opt/tickif/production/private-ready-release
echo 'PASS: migration and internal readiness complete. Public ingress remains closed; DNS unchanged.'
