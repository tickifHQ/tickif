#!/usr/bin/env bash
# Disposable synthetic fixtures only; no real key or external exporter is used.
set -Eeuo pipefail
cd "$(dirname "$0")/../../.."
image=otel/opentelemetry-collector-contrib:0.148.0@sha256:8164eab2e6bca9c9b0837a8d2f118a6618489008a839db7f9d6510e66be3923c
fixture=$(mktemp -d)
container="tickif-local-otel-test-$$-$RANDOM"
network="${container}-network"
cleanup() {
  result=$?
  if (( result != 0 )); then docker logs "$container" >&2 2>/dev/null || true; fi
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf -- "$fixture"
}
trap cleanup EXIT
docker_path() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
export MSYS_NO_PATHCONV=1
repository=$(docker_path "$PWD")
scratch=$(docker_path "$fixture")
chmod 0755 "$fixture"
printf '%s' synthetic-local-validation-key >"$fixture/key"
chmod 0644 "$fixture/key"

# --env-file bypasses the developer's real .env. Compose config reads only the
# secret filename, never its content, and does not start dependency services.
docker compose --env-file .env.example -f docker-compose.yml --profile observability config --format json >"$fixture/compose.json"
docker run --rm --network none \
  --mount "type=bind,source=$scratch/compose.json,target=/compose.json,readonly" \
  node:22-bookworm-slim node -e '
    const assert = require("node:assert/strict");
    const config = JSON.parse(require("node:fs").readFileSync("/compose.json", "utf8"));
    const collector = config.services["otel-collector"];
    assert.deepEqual(collector.profiles, ["observability"]);
    assert.equal(collector.ports.length, 1);
    assert.equal(collector.ports[0].host_ip, "127.0.0.1");
    assert.equal(collector.ports[0].target, 4318);
    assert.equal(collector.depends_on, undefined);
    assert.equal(collector.read_only, true);
    assert.deepEqual(collector.cap_drop, ["ALL"]);
    assert.equal(collector.secrets[0].source, "signoz_ingestion_key");
    assert.equal(collector.volumes.length, 1);
    assert.equal(collector.volumes[0].read_only, true);
    for (const [name, service] of Object.entries(config.services)) {
      if (name !== "otel-collector") assert.equal(service.secrets, undefined);
    }
  '
docker run --rm --network none \
  --env SIGNOZ_OTLP_ENDPOINT=https://ingest.in2.signoz.cloud:443 \
  --mount "type=bind,source=$repository/infra/local/observability/collector.yml,target=/etc/config.yml,readonly" \
  --mount "type=bind,source=$scratch/key,target=/run/secrets/signoz_ingestion_key,readonly" \
  "$image" validate --config=/etc/config.yml

# Keep the production receivers/processors/pipelines and replace only the
# remote exporter with debug. The isolated network cannot reach SigNoz.
awk '
  /^exporters:/ { print "exporters:\n  debug:\n    verbosity: detailed"; skip=1 }
  /^service:/ { skip=0 }
  !skip { gsub("otlphttp/signoz", "debug"); print }
' infra/local/observability/collector.yml >"$fixture/debug.yml"
chmod 0644 "$fixture/debug.yml"
docker network create --internal "$network" >/dev/null
docker run -d --name "$container" --network "$network" --network-alias collector \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,source=$scratch/debug.yml,target=/etc/config.yml,readonly" \
  "$image" --config=/etc/config.yml >/dev/null
docker run --rm --network "$network" node:22-bookworm-slim node -e '
  const assert = require("node:assert/strict");
  const attributes = [
    {key:"service.name",value:{stringValue:"tickif-api"}},
    {key:"deployment.environment.name",value:{stringValue:"staging"}}
  ];
  const resource = {attributes};
  const now = (BigInt(Date.now()) * 1000000n).toString();
  const traces = {resourceSpans:[{resource,scopeSpans:[{spans:[{
    traceId:"4bf92f3577b34da6a3ce929d0e0e4736",spanId:"00f067aa0ba902b7",
    name:"local-fixture-trace",kind:2,startTimeUnixNano:now,endTimeUnixNano:now
  }]}]}]};
  const metrics = {resourceMetrics:[{resource,scopeMetrics:[{metrics:[{
    name:"tickif.local.fixture.requests",unit:"{request}",sum:{
      aggregationTemporality:2,isMonotonic:true,
      dataPoints:[{startTimeUnixNano:now,timeUnixNano:now,asInt:"1"}]
    }
  }]}]}]};
  (async () => {
    for (let attempt=0; attempt<20; attempt++) {
      try {
        const response = await fetch("http://collector:4318/v1/traces", {
          method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(traces)
        });
        assert.equal(response.status,200);
        break;
      } catch(error) {
        if(attempt===19) throw error;
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    }
    const response = await fetch("http://collector:4318/v1/metrics", {
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(metrics)
    });
    assert.equal(response.status,200);
    const logs = await fetch("http://collector:4318/v1/logs", {
      method:"POST",headers:{"content-type":"application/json"},body:"{}"
    });
    assert.equal(logs.status,404);
  })().catch(error=>{console.error(error);process.exitCode=1;});
  '
found=false
for ((i=0; i<15; i++)); do
  docker logs "$container" >"$fixture/output" 2>&1
  if grep -q local-fixture-trace "$fixture/output" && grep -q tickif.local.fixture.requests "$fixture/output"; then found=true; break; fi
  sleep 1
done
[[ "$found" == true ]]
grep -q 'deployment.environment.name: Str(development)' "$fixture/output"
[[ "$(grep -c 'deployment.environment.name: Str(development)' "$fixture/output")" -ge 2 ]]
grep -q 'service.namespace: Str(tickif)' "$fixture/output"
grep -q 'service.name: Str(tickif-api)' "$fixture/output"
! grep -q 'deployment.environment.name: Str(staging)' "$fixture/output"
! grep -q synthetic-local-validation-key "$fixture/output"
echo 'Local loopback Compose wiring, file secret, traces/metrics and development environment mapping passed.'
