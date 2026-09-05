#!/usr/bin/env bash
# Run on the single labeled Azure Swarm manager, from a reviewed release checkout.
set -euo pipefail
cd "$(dirname "$0")"
hold_traffic=false
case "${1:-}" in
  '') ;;
  --hold-traffic) hold_traffic=true ;;
  *) echo 'Usage: release.sh [--hold-traffic]' >&2; exit 1 ;;
esac
stack=tickif-staging
exec 9>/var/lock/tickif-staging-release.lock
flock -n 9 || { echo 'Another staging release is running' >&2; exit 1; }
test "$(docker info --format '{{.Swarm.ControlAvailable}}')" = true || {
  echo 'Run on the existing Swarm manager; this command does not initialize Swarm' >&2; exit 1;
}
node_id=$(docker info --format '{{.Swarm.NodeID}}')
mapfile -t nodes < <(docker node ls --filter node.label=tickif.staging=true --format '{{.ID}}')
test "${#nodes[@]}" -eq 1 && test "${nodes[0]}" = "$node_id" || {
  echo 'Exactly this manager must have node label tickif.staging=true (local persistent volumes)' >&2; exit 1;
}
for image in \
  "${API_IMAGE:?}" "${WORKER_IMAGE:?}" "${WEB_IMAGE:?}" \
  "${CADDY_IMAGE:?}" "${POSTGRES_IMAGE:?}" "${REDIS_IMAGE:?}" "${TYPESENSE_IMAGE:?}"; do
  [[ "$image" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'Release images must use immutable sha256 digests' >&2; exit 1; }
done
[[ "${RAZORPAY_KEY_ID:?}" == rzp_test_* ]] || { echo 'Staging requires Razorpay test mode' >&2; exit 1; }
[[ "${STAGING_DOMAIN:?}" =~ ^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$ ]] || { echo 'Set a valid staging DNS hostname' >&2; exit 1; }
export CADDY_CONFIG_VERSION
CADDY_CONFIG_VERSION=$(sha256sum Caddyfile | cut -c1-16)
docker stack config --compose-file stack.staging.yml >/dev/null

close_traffic() {
  for service in edge api web worker; do
    if docker service inspect "${stack}_${service}" >/dev/null 2>&1; then
      docker service scale --detach=true "${stack}_${service}=0" >/dev/null
    fi
  done
}
wait_stopped() {
  for ((attempt=0; attempt<90; attempt++)); do
    running=$(docker ps -q --filter "label=com.docker.stack.namespace=$stack" \
      --filter "label=com.docker.swarm.service.name=${stack}_api")
    running+=$(docker ps -q --filter "label=com.docker.swarm.service.name=${stack}_worker")
    running+=$(docker ps -q --filter "label=com.docker.swarm.service.name=${stack}_web")
    running+=$(docker ps -q --filter "label=com.docker.swarm.service.name=${stack}_edge")
    test -z "$running" && return 0
    sleep 2
  done
  echo 'Application writers did not stop; migration aborted' >&2
  return 1
}
fail_closed() {
  code=$?
  if test "$code" -ne 0; then
    close_traffic
    docker service scale --detach=true "${stack}_prepare=0" >/dev/null 2>&1 || true
    echo 'Release failed. Traffic remains closed; use the rollback runbook.' >&2
  fi
}
trap fail_closed EXIT
close_traffic
wait_stopped
# All app replicas in the manifest are zero; no depends_on assumption in Swarm.
docker stack deploy --with-registry-auth --compose-file stack.staging.yml "$stack"

previous_tasks=" $(docker service ps -q --no-trunc "${stack}_prepare" | tr '\n' ' ') "
docker service update --detach=true --replicas 1 --force "${stack}_prepare" >/dev/null
completed=false
for ((attempt=0; attempt<900; attempt++)); do
  while read -r task; do
    test -n "$task" || continue
    [[ "$previous_tasks" == *" $task "* ]] && continue
    state=$(docker inspect --format '{{.Status.State}}' "$task")
    case "$state" in
      complete) completed=true; break ;;
      failed|rejected|orphaned) echo 'Preparation failed; inspect the prepare service logs' >&2; exit 1 ;;
    esac
  done < <(docker service ps -q --no-trunc "${stack}_prepare")
  "$completed" && break
  sleep 2
done
"$completed" || { echo 'Preparation exceeded 30 minutes' >&2; exit 1; }
docker service scale --detach=true "${stack}_prepare=0" >/dev/null

wait_healthy() {
  local service=$1
  for ((attempt=0; attempt<90; attempt++)); do
    container=$(docker ps -q --filter "label=com.docker.swarm.service.name=${stack}_${service}")
    if test -n "$container" && test "$(docker inspect --format '{{.State.Health.Status}}' "$container")" = healthy; then
      return 0
    fi
    sleep 2
  done
  echo "$service did not become healthy" >&2
  return 1
}
for service in worker api web; do
  docker service scale --detach=true "${stack}_${service}=1" >/dev/null
  wait_healthy "$service"
done
if "$hold_traffic"; then
  echo 'Internal application health checks passed; public edge remains at zero replicas.'
  exit 0
fi
docker service scale --detach=true "${stack}_edge=1" >/dev/null
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 2 \
  --connect-timeout 5 --max-time 10 "https://${STAGING_DOMAIN}/health" >/dev/null
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 \
  --connect-timeout 5 --max-time 10 "https://${STAGING_DOMAIN}/login" >/dev/null
echo 'Infrastructure release healthy. Run the authenticated/provider smoke checklist before signing off staging.'
