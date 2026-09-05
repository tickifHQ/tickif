#!/usr/bin/env bash
# Only GitHub-hosted disposable CI. Never initializes a developer/Azure daemon.
set -euo pipefail
test "${GITHUB_ACTIONS:-}" = true && test "${RUNNER_ENVIRONMENT:-}" = github-hosted || {
  echo 'This fixture is restricted to a disposable GitHub-hosted runner' >&2; exit 1;
}
test "$(docker info --format '{{.Swarm.LocalNodeState}}')" = inactive || exit 1
cd "$(dirname "$0")/.."
docker run -d --name staging-test-registry -p 127.0.0.1:5000:5000 registry:2
revision=$(git rev-parse HEAD)
for service in api worker web; do
  docker push "localhost:5000/tickif/$service:$revision"
done
docker swarm init --advertise-addr "$(hostname -I | awk '{print $1}')" >/dev/null
docker node update --label-add tickif.staging=true "$(docker info --format '{{.Swarm.NodeID}}')"
set -a
source deploy/staging.env.example
set +a
export API_IMAGE WORKER_IMAGE WEB_IMAGE
API_IMAGE=$(docker image inspect "localhost:5000/tickif/api:$revision" --format '{{index .RepoDigests 0}}')
WORKER_IMAGE=$(docker image inspect "localhost:5000/tickif/worker:$revision" --format '{{index .RepoDigests 0}}')
WEB_IMAGE=$(docker image inspect "localhost:5000/tickif/web:$revision" --format '{{index .RepoDigests 0}}')
export R2_ACCOUNT_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export RAZORPAY_KEY_ID=rzp_test_synthetic
export EMAIL_FROM='Tickif Staging <ci@example.com>'

fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
cat >"$fixture/app" <<'EOF'
POSTGRES_PASSWORD=synthetic-postgres-password
REDIS_URL=redis://:synthetic-redis-password@redis:6379/0
BETTER_AUTH_SECRET=synthetic-auth-secret-for-image-tests
TYPESENSE_API_KEY=synthetic-typesense-admin
TYPESENSE_SEARCH_API_KEY=synthetic-typesense-search
GOOGLE_CLIENT_SECRET=synthetic-google-secret
R2_ACCESS_KEY_ID=synthetic-r2-access
R2_SECRET_ACCESS_KEY=synthetic-r2-secret
RESEND_API_KEY=synthetic-resend-secret
NOVU_SECRET_KEY=synthetic-novu-secret
RAZORPAY_KEY_SECRET=synthetic-razorpay-secret
RAZORPAY_WEBHOOK_SECRET=synthetic-razorpay-webhook
EOF
printf '%s' synthetic-postgres-password >"$fixture/postgres"
cat >"$fixture/redis" <<'EOF'
appendonly yes
maxmemory 512mb
maxmemory-policy noeviction
requirepass synthetic-redis-password
EOF
cat >"$fixture/typesense" <<'EOF'
data-dir = /data
api-key = synthetic-typesense-admin
EOF
docker secret create "$APP_SECRET" "$fixture/app"
docker secret create "$POSTGRES_SECRET" "$fixture/postgres"
docker secret create "$REDIS_SECRET" "$fixture/redis"
docker secret create "$TYPESENSE_SECRET" "$fixture/typesense"
(cd deploy && docker stack deploy --with-registry-auth -c stack.staging.yml tickif-staging)
docker service create --detach=true --name staging-key-fixture --restart-condition none \
  --network tickif-staging_backend "$API_IMAGE" node -e '
  (async () => {
    for (let i=0; i<60; i++) {
      try {
        const health=await fetch("http://typesense:8108/health",{signal:AbortSignal.timeout(2000)});
        if(health.ok) break;
      } catch {}
      await new Promise(r=>setTimeout(r,2000));
    }
    const result=await fetch("http://typesense:8108/keys",{
      method:"POST",headers:{"X-TYPESENSE-API-KEY":"synthetic-typesense-admin","Content-Type":"application/json"},
      body:JSON.stringify({description:"CI search",actions:["documents:search"],collections:["tickif_staging_.*"],value:"synthetic-typesense-search"})
    });
    if(!result.ok) process.exit(1);
  })().catch(()=>process.exit(1));'
key_ready=false
for ((i=0; i<90; i++)); do
  task=$(docker service ps -q --no-trunc staging-key-fixture | head -1)
  if test -n "$task"; then
    state=$(docker inspect --format '{{.Status.State}}' "$task")
    test "$state" = complete && { key_ready=true; break; }
    case "$state" in failed|rejected) exit 1 ;; esac
  fi
  sleep 2
done
"$key_ready" || exit 1
docker service rm staging-key-fixture
bash deploy/release.sh --hold-traffic
# A bad mounted credential must fail the release and leave all traffic/writers closed.
good_secret=$APP_SECRET
export APP_SECRET=tickif_staging_app_invalid
printf '%s\n' 'BETTER_AUTH_SECRET=too-short' >"$fixture/invalid"
docker secret create "$APP_SECRET" "$fixture/invalid"
if bash deploy/release.sh --hold-traffic; then
  echo 'Invalid secret unexpectedly passed the release gate' >&2
  exit 1
fi
for service in edge api web worker; do
  test "$(docker service inspect "tickif-staging_$service" --format '{{.Spec.Mode.Replicated.Replicas}}')" = 0
done
export APP_SECRET=$good_secret
# A second release proves completed one-shot tasks are not mistaken for the new run.
bash deploy/release.sh --hold-traffic
test "$(docker service inspect tickif-staging_edge --format '{{.Spec.Mode.Replicated.Replicas}}')" = 0
test "$(docker service inspect tickif-staging_prepare --format '{{.Spec.Mode.Replicated.Replicas}}')" = 0
api=$(docker ps -q --filter label=com.docker.swarm.service.name=tickif-staging_api)
docker exec "$api" curl --fail http://localhost:3001/health
worker=$(docker ps -q --filter label=com.docker.swarm.service.name=tickif-staging_worker)
docker exec "$worker" curl --fail http://localhost:3002/readyz
web=$(docker ps -q --filter label=com.docker.swarm.service.name=tickif-staging_web)
docker exec "$web" node -e "fetch('http://127.0.0.1:3000/login').then(async r=>{if(!r.ok || !(await r.text()).includes('/_next/static/'))process.exit(1)})"
# Validate the production Caddyfile without obtaining certificates or opening ingress.
docker run --rm -e STAGING_DOMAIN -e ACME_EMAIL \
  -v "$PWD/deploy/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.10-alpine \
  caddy validate --config /etc/caddy/Caddyfile
echo 'Two isolated Swarm releases passed. Real TLS/provider/R2 smoke remains a staging check.'
