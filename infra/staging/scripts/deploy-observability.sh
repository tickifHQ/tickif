#!/usr/bin/env bash
# Explicit operator action; does not deploy or stop application services.
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_staging_env "${1:-$DEFAULT_ENV_FILE}"
acquire_release_lock
assert_single_manager
observability_stack="${OBSERVABILITY_STACK_NAME:-tickif-observability}"
[[ "$observability_stack" != "$STACK_NAME" && "$observability_stack" =~ ^[a-z][a-z0-9-]{0,39}$ ]] || {
  echo 'Observability requires a distinct valid stack name to survive app pruning' >&2; exit 1;
}
require_variables SIGNOZ_OTLP_ENDPOINT SIGNOZ_INGESTION_KEY_SECRET TELEMETRY_STORAGE_PATH
[[ "$SIGNOZ_OTLP_ENDPOINT" =~ ^https://[a-zA-Z0-9.-]+(:443)?/?$ ]] || {
  echo 'SigNoz ingestion requires an HTTPS base origin without credentials, path or query' >&2; exit 1;
}
require_secrets "$SIGNOZ_INGESTION_KEY_SECRET"
[[ "$TELEMETRY_STORAGE_PATH" == /var/lib/docker/* && "$TELEMETRY_STORAGE_PATH" != *..* ]] || {
  echo 'Telemetry storage must be an absolute bounded mount under /var/lib/docker' >&2; exit 1;
}
mountpoint -q -- "$TELEMETRY_STORAGE_PATH" || {
  echo 'Provision a dedicated <=1 GiB persistent telemetry filesystem first; see observability runbook' >&2; exit 1;
}
storage_kib=$(df -Pk -- "$TELEMETRY_STORAGE_PATH" | awk 'NR==2 {print $2}')
[[ "$storage_kib" =~ ^[0-9]+$ && "$storage_kib" -le 1048576 ]] || {
  echo 'Telemetry filesystem must be <=1 GiB to bound WAL/offset growth' >&2; exit 1;
}
[[ -d "$TELEMETRY_STORAGE_PATH/collector" && ! -L "$TELEMETRY_STORAGE_PATH/collector" ]] || {
  echo 'Create the collector directory inside the mounted bounded telemetry filesystem first' >&2; exit 1;
}
for network in tickif_backend tickif_edge; do
  docker network inspect "$network" >/dev/null || { echo 'Deploy application infrastructure before observability' >&2; exit 1; }
done
ensure_telemetry_network

observability_dir="$STAGING_DIR/observability"
collector_image=otel/opentelemetry-collector-contrib:0.148.0@sha256:8164eab2e6bca9c9b0837a8d2f118a6618489008a839db7f9d6510e66be3923c
proxy_image=haproxy:3.2.12-alpine@sha256:15ef8657ec12e7b19d5b6b6b6fcf6839a0e3cdae85d275be6c867e8a2690f33f
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
printf '%s' synthetic-config-validation-key >"$scratch/key"
# The pinned validator runs as UID 10001. The individual file bind bypasses
# mktemp's 0700 directory, but still honors the file mode under operator umask 077.
# This is a synthetic key only; real credentials stay in Swarm secrets.
chmod 0644 "$scratch/key"
# Validate without granting Docker/host access and without reading a real key.
docker run --rm --network none \
  --env SIGNOZ_OTLP_ENDPOINT --env DEPLOYMENT_ENV=staging \
  --env TELEMETRY_HOST_NAME=validation --env TELEMETRY_HOST_ID=validation \
  --mount "type=bind,source=$observability_dir/collector.yml,target=/etc/config.yml,readonly" \
  --mount "type=bind,source=$scratch/key,target=/run/secrets/signoz_ingestion_key,readonly" \
  --mount "type=bind,source=$scratch,target=/hostfs,readonly" \
  "$collector_image" validate --config=/etc/config.yml
docker run --rm --network none \
  --mount "type=bind,source=$observability_dir/docker-proxy.cfg,target=/usr/local/etc/haproxy/haproxy.cfg,readonly" \
  "$proxy_image" haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
collector_hash=$(sha256sum "$observability_dir/collector.yml" | cut -c1-12)
proxy_hash=$(sha256sum "$observability_dir/docker-proxy.cfg" | cut -c1-12)
export OTEL_COLLECTOR_CONFIG="tickif_staging_collector_${collector_hash}"
export TELEMETRY_DOCKER_PROXY_CONFIG="tickif_staging_telemetry_proxy_${proxy_hash}"
docker config inspect "$OTEL_COLLECTOR_CONFIG" >/dev/null 2>&1 || \
  docker config create "$OTEL_COLLECTOR_CONFIG" "$observability_dir/collector.yml" >/dev/null
docker config inspect "$TELEMETRY_DOCKER_PROXY_CONFIG" >/dev/null 2>&1 || \
  docker config create "$TELEMETRY_DOCKER_PROXY_CONFIG" "$observability_dir/docker-proxy.cfg" >/dev/null
docker stack config --compose-file "$observability_dir/stack.yml" >/dev/null
docker stack deploy --with-registry-auth --compose-file "$observability_dir/stack.yml" "$observability_stack"
echo 'Observability specification deployed. Verify task health, ingestion, storage and alert smoke tests before enabling app telemetry.'
