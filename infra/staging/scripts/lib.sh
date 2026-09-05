#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_ENV_FILE="/opt/tickif/staging.env"

load_staging_env() {
  local env_file="${1:-$DEFAULT_ENV_FILE}"
  if [[ ! -f "$env_file" ]]; then
    echo "staging environment file not found: $env_file" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
  : "${STACK_NAME:=tickif}"
  export STACK_NAME
}

require_variables() {
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      echo "required variable is unset: $name" >&2
      return 1
    fi
  done
}

assert_immutable_image() {
  local image="$1"
  if [[ "$image" == *":latest" || "$image" != *@sha256:* && ! "$image" =~ :[0-9a-f]{40,64}$ ]]; then
    echo "image must use a digest or full commit-SHA tag, never latest: $image" >&2
    return 1
  fi
}

secret_exists() {
  docker secret inspect "$1" >/dev/null 2>&1
}

wait_for_job() {
  local service="$1"
  local deadline=$((SECONDS + 900))
  while (( SECONDS < deadline )); do
    local states
    states="$(docker service ps "$service" --no-trunc --format '{{.CurrentState}}|{{.Error}}')"
    if grep -Eq 'Rejected|Failed' <<<"$states"; then
      docker service logs "$service" >&2 || true
      return 1
    fi
    if grep -q '^Complete' <<<"$states"; then
      return 0
    fi
    sleep 3
  done
  docker service logs "$service" >&2 || true
  echo "timed out waiting for Swarm job: $service" >&2
  return 1
}

run_swarm_job() {
  local job_name="$1"
  local image="$2"
  shift 2
  local -a service_options=()
  while (($#)) && [[ "$1" != "--" ]]; do
    service_options+=("$1")
    shift
  done
  [[ "${1:-}" == "--" ]] || { echo "run_swarm_job requires -- before the command" >&2; return 2; }
  shift
  local -a command=("$@")
  if docker service inspect "$job_name" >/dev/null 2>&1; then
    echo "Job already exists; refusing to reuse completion history" >&2; return 1
  fi
  docker service create --detach=true --no-healthcheck \
    --name "$job_name" \
    --mode replicated-job \
    --replicas 1 \
    --restart-condition none \
    --constraint 'node.labels.tickif.stateful==true' \
    --network tickif_backend \
    --with-registry-auth \
    "${service_options[@]}" \
    "$image" \
    "${command[@]}" >/dev/null

  local result=0
  wait_for_job "$job_name" || result=$?
  docker service logs "$job_name" || true
  docker service rm "$job_name" >/dev/null
  return "$result"
}

acquire_release_lock() {
  exec 9>"${RELEASE_LOCK_FILE:-/var/lock/tickif-staging-release.lock}"
  flock -n 9 || { echo 'Another release/restore is running' >&2; exit 1; }
}

assert_single_manager() {
  [[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" == true ]] || return 1
  [[ "$(docker node ls -q | wc -l)" -eq 1 ]] || { echo 'This staging release supports one manager with local persistent volumes' >&2; return 1; }
  local node
  node=$(docker info --format '{{.Swarm.NodeID}}')
  for label in tickif.stateful tickif.traefik; do
    [[ "$(docker node inspect "$node" --format "{{index .Spec.Labels \"$label\"}}")" == true ]] || return 1
  done
}

close_traffic() {
  local service
  for service in traefik api web worker; do
    if docker service inspect "${STACK_NAME}_$service" >/dev/null 2>&1; then
      docker service scale --detach=true "${STACK_NAME}_$service=0" >/dev/null || return 1
    fi
  done
}

wait_stopped() {
  local deadline=$((SECONDS + 240)) service running
  while (( SECONDS < deadline )); do
    running=''
    for service in traefik api web worker; do
      running+=$(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_$service")
    done
    [[ -z "$running" ]] && return 0
    sleep 2
  done
  echo 'Writers did not stop; database work refused' >&2; return 1
}

wait_healthy() {
  local service="$1" count="$2" deadline=$((SECONDS + 600)) healthy id
  while (( SECONDS < deadline )); do
    healthy=0
    while read -r id; do
      [[ -z "$id" ]] && continue
      [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")" == healthy ]] && healthy=$((healthy + 1))
    done < <(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_$service")
    [[ "$healthy" == "$count" ]] && return 0
    sleep 3
  done
  echo "Service $service failed readiness" >&2; return 1
}
