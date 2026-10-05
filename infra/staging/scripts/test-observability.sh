#!/usr/bin/env bash
# Isolated containers only. Never initializes Swarm or changes application services.
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
image=otel/opentelemetry-collector-contrib:0.148.0@sha256:8164eab2e6bca9c9b0837a8d2f118a6618489008a839db7f9d6510e66be3923c
proxy_image=haproxy:3.2.12-alpine@sha256:15ef8657ec12e7b19d5b6b6b6fcf6839a0e3cdae85d275be6c867e8a2690f33f
fixture=$(mktemp -d)
container="tickif-otel-test-$$-$RANDOM"
proxy_container="${container}-proxy"
label_container="${container}-label"
network="${container}-network"
cleanup() {
  result=$?
  if (( result != 0 )); then docker logs "$container" >&2 2>/dev/null || true; fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker rm -f "$proxy_container" >/dev/null 2>&1 || true
  docker rm -f "$label_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf -- "$fixture"
}
trap cleanup EXIT
# Permit the same disposable test under Git Bash on Windows without path rewriting.
docker_path() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
export MSYS_NO_PATHCONV=1
repository=$(docker_path "$PWD")
scratch=$(docker_path "$fixture")
printf '%s' synthetic-collector-key >"$fixture/key"
mkdir -p "$fixture/logs" "$fixture/storage"
docker run --rm --network none \
  --env SIGNOZ_OTLP_ENDPOINT=https://ingest.in.signoz.cloud:443 \
  --env DEPLOYMENT_ENV=staging --env TELEMETRY_HOST_NAME=fixture --env TELEMETRY_HOST_ID=fixture \
  --mount "type=bind,source=$repository/infra/staging/observability/collector.yml,target=/etc/config.yml,readonly" \
  --mount "type=bind,source=$scratch/key,target=/run/secrets/signoz_ingestion_key,readonly" \
  --mount "type=bind,source=$scratch,target=/hostfs,readonly" \
  "$image" validate --config=/etc/config.yml
docker run --rm --network none \
  --mount "type=bind,source=$repository/infra/staging/observability/docker-proxy.cfg,target=/usr/local/etc/haproxy/haproxy.cfg,readonly" \
  "$proxy_image" haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg

# Prove the engine writes the metadata used by the production file receiver.
docker run --name "$label_container" --network none --log-driver json-file \
  --label tickif.telemetry.service=tickif-fixture --log-opt labels=tickif.telemetry.service \
  --entrypoint /bin/sh "$proxy_image" -c 'echo "{}"' >/dev/null
log_path=$(docker inspect --format '{{.LogPath}}' "$label_container")
docker run --rm --network none \
  --mount "type=bind,source=$log_path,target=/fixture-json.log,readonly" \
  node:22-bookworm-slim node -e '
    const fs = require("node:fs");
    const record = JSON.parse(fs.readFileSync("/fixture-json.log", "utf8").trim());
    if(record.attrs["tickif.telemetry.service"] !== "tickif-fixture") process.exit(1);
  '

# Exercise the actual proxy against Docker; forbidden requests cannot mutate anything.
docker network create "$network" >/dev/null
docker run -d --name "$proxy_container" --network "$network" --network-alias docker-proxy \
  --read-only --cap-drop ALL --security-opt no-new-privileges --user 0:0 \
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly \
  --mount "type=bind,source=$repository/infra/staging/observability/docker-proxy.cfg,target=/usr/local/etc/haproxy/haproxy.cfg,readonly" \
  "$proxy_image" >/dev/null
sleep 1
proxy_id=$(docker inspect --format '{{.Id}}' "$proxy_container")
docker run --rm --network "$network" --env FIXTURE_CONTAINER_ID="$proxy_id" --entrypoint /bin/sh "$proxy_image" -ec '
  test "$(wget -qO- http://docker-proxy:2375/_ping)" = OK
  wget -qO /dev/null http://docker-proxy:2375/containers/json
  wget -qO /dev/null "http://docker-proxy:2375/containers/$FIXTURE_CONTAINER_ID/json"
  wget -qO /dev/null "http://docker-proxy:2375/containers/$FIXTURE_CONTAINER_ID/stats?stream=false"
  for path in /secrets /services /containers/0123456789ab/logs /containers/0123456789ab/archive; do
    wget -S -O /dev/null "http://docker-proxy:2375$path" 2>&1 | grep -q "403 Forbidden"
  done
  wget -S -O /dev/null --post-data="" http://docker-proxy:2375/_ping 2>&1 | grep -q "403 Forbidden"
'

# Reuse production parser/processors verbatim; replace exporters with local debug.
{
  printf 'receivers:\n'
  awk '/^  filelog:/ {emit=1} /^  hostmetrics:/ {emit=0} emit' infra/staging/observability/collector.yml |
    sed 's@include: .*@include: [/fixture/logs/*-json.log]@'
  awk '/^processors:/ {emit=1} /^exporters:/ {emit=0} emit' infra/staging/observability/collector.yml
  cat <<'CONFIG'
exporters:
  debug:
    verbosity: detailed
extensions:
  file_storage/offsets:
    directory: /fixture/storage/offsets
    create_directory: true
service:
  extensions: [file_storage/offsets]
  pipelines:
    logs:
      receivers: [filelog]
      processors: [memory_limiter, resource/environment, resource/host, transform/logs, batch]
      exporters: [debug]
CONFIG
} >"$fixture/parser.yml"
: >"$fixture/logs/fixture-json.log"
start_collector() {
  docker run -d --name "$container" --network none \
    --env DEPLOYMENT_ENV=staging --env TELEMETRY_HOST_NAME=fixture --env TELEMETRY_HOST_ID=node-fixture \
    --mount "type=bind,source=$scratch,target=/fixture" \
    "$image" --config=/fixture/parser.yml >/dev/null
  sleep 2
}
start_collector
cat >>"$fixture/logs/fixture-json.log" <<'LOGS'
{"log":"{\"schema_version\":1,\"timestamp\":\"2026-10-05T09:00:00.123Z\",\"level\":50,\"service\":\"tickif-api\",\"version\":\"api-fixture-release\",\"event\":\"browser.unique-fixture-event\",\"message\":\"fixture\",\"trace_id\":\"4bf92f3577b34da6a3ce929d0e0e4736\",\"span_id\":\"00f067aa0ba902b7\",\"attributes\":{\"telemetrySource\":\"browser\",\"sourceService\":\"tickif-browser\",\"browserRelease\":\"fixture-release\",\"token\":\"[REDACTED]\"}}\n","stream":"stdout","time":"2026-10-05T10:00:00.123456789Z","attrs":{"tickif.telemetry.service":"tickif-api"}}
{"log":"UNSTRUCTURED-MUST-NOT-EXPORT\n","stream":"stderr","time":"2026-10-05T10:00:01.123456789Z","attrs":{"tickif.telemetry.service":"tickif-api"}}
{"log":"Email recipient@example.com OTP 123456 EMAIL-OTP-MUST-NOT-EXPORT\n","stream":"stdout","time":"2026-10-05T10:00:01.223456789Z","attrs":{"tickif.telemetry.service":"tickif-api"}}
{"log":"{\"level\":\"info\",\"message\":\"THIRD-PARTY-MUST-NOT-EXPORT\"}\n","stream":"stdout","time":"2026-10-05T10:00:01.323456789Z","attrs":{"tickif.telemetry.service":"tickif-api"}}
{"log":"{\"message\":\"UNLABELED-MUST-NOT-EXPORT\"}\n","stream":"stdout","time":"2026-10-05T10:00:02.123456789Z"}
{"log":"{\"level\":\"info\",\"RequestPath\":\"/reset?token=TRAEFIK-MUST-NOT-EXPORT\",\"ClientAddr\":\"IP-MUST-NOT-EXPORT\",\"request_Referer\":\"REFERER-MUST-NOT-EXPORT\",\"DownstreamStatus\":200,\"RequestMethod\":\"GET\"}\n","stream":"stdout","time":"2026-10-05T10:00:03.123456789Z","attrs":{"tickif.telemetry.service":"tickif-traefik"}}
{"log":"{\"schema_version\":1,\"timestamp\":\"2026-10-05T09:00:01.456Z\",\"level\":60,\"service\":\"tickif-worker\",\"version\":\"fixture-release\",\"event\":\"unique-fatal-fixture-event\",\"message\":\"fatal fixture\",\"attributes\":{}}\n","stream":"stdout","time":"2026-10-05T10:00:04.123456789Z","attrs":{"tickif.telemetry.service":"tickif-worker"}}
LOGS
found=false
for ((i=0; i<20; i++)); do
  docker logs "$container" >"$fixture/output" 2>&1
  if grep -q unique-fixture-event "$fixture/output"; then found=true; break; fi
  sleep 1
done
if [[ "$found" != true ]]; then cat "$fixture/output" >&2; exit 1; fi
grep -q 'service.name: Str(tickif-browser)' "$fixture/output"
grep -q 'service.version: Str(fixture-release)' "$fixture/output"
grep -q 'deployment.environment.name: Str(staging)' "$fixture/output"
grep -q 'SeverityText: ERROR' "$fixture/output"
grep -q 'SeverityText: FATAL' "$fixture/output"
grep -q 'SeverityNumber: Fatal(21)' "$fixture/output"
grep -q 'Timestamp: 2026-10-05 09:00:00.123' "$fixture/output"
grep -q 'Timestamp: 2026-10-05 09:00:01.456' "$fixture/output"
grep -q 'Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736' "$fixture/output"
grep -q 'Span ID: 00f067aa0ba902b7' "$fixture/output"
! grep -Eq 'UNSTRUCTURED-MUST|UNLABELED-MUST|TRAEFIK-MUST|IP-MUST|REFERER-MUST|EMAIL-OTP-MUST|THIRD-PARTY-MUST' "$fixture/output"
[[ "$(grep -c 'Body:.*unique-fixture-event' "$fixture/output")" == 1 ]]
# Reuse offset storage; restarting must not replay the previous record.
docker stop "$container" >/dev/null
docker rm "$container" >/dev/null
start_collector
sleep 6
docker logs "$container" >"$fixture/restarted" 2>&1
! grep -q unique-fixture-event "$fixture/restarted"
echo 'Pinned collector validation, file-secret loading, trace/severity/resource mapping, safe filtering and restart offsets passed.'
