#!/usr/bin/env bash
# Disposable CI only: never initializes a developer or Azure Docker daemon.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || exit 1
[[ "$(docker info --format '{{.Swarm.LocalNodeState}}')" == inactive ]] || exit 1
cd "$(dirname "$0")/../../.."
docker run -d --name staging-test-registry -p 127.0.0.1:5000:5000 registry:2
revision=$(git rev-parse HEAD)
for service in api worker web operations; do docker push "localhost:5000/tickif/$service:$revision"; done
docker swarm init --advertise-addr "$(hostname -I | awk '{print $1}')" >/dev/null
docker node update --label-add tickif.stateful=true --label-add tickif.traefik=true "$(docker info --format '{{.Swarm.NodeID}}')"
set -a
source infra/staging/.env.example
set +a
export API_IMAGE WEB_IMAGE WORKER_IMAGE OPERATIONS_IMAGE HOLD_TRAFFIC=true
API_IMAGE=$(docker image inspect "localhost:5000/tickif/api:$revision" --format '{{index .RepoDigests 0}}')
WEB_IMAGE=$(docker image inspect "localhost:5000/tickif/web:$revision" --format '{{index .RepoDigests 0}}')
WORKER_IMAGE=$(docker image inspect "localhost:5000/tickif/worker:$revision" --format '{{index .RepoDigests 0}}')
OPERATIONS_IMAGE=$(docker image inspect "localhost:5000/tickif/operations:$revision" --format '{{index .RepoDigests 0}}')
export GOOGLE_CLIENT_ID=synthetic.apps.googleusercontent.com RAZORPAY_KEY_ID=rzp_test_synthetic
export STAGING_HOST=staging.invalid
export ACME_CA_SERVER=http://127.0.0.1:9/directory
export EMAIL_FROM='Tickif Staging <ci@example.com>'
export DESIRED_API_REPLICAS=1 DESIRED_WEB_REPLICAS=1 DESIRED_WORKER_REPLICAS=1
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
for entry in POSTGRES_PASSWORD_SECRET:synthetic-postgres-password REDIS_PASSWORD_SECRET:synthetic-redis-password TYPESENSE_ADMIN_KEY_SECRET:synthetic-typesense-admin TYPESENSE_SEARCH_KEY_SECRET:synthetic-typesense-search BETTER_AUTH_SECRET_NAME:synthetic-auth-secret-for-image-tests NOVU_SECRET_NAME:synthetic-novu-key R2_ACCESS_KEY_ID_SECRET:synthetic-r2-access R2_SECRET_ACCESS_KEY_SECRET:synthetic-r2-secret RESEND_API_KEY_SECRET:synthetic-resend-key GOOGLE_CLIENT_SECRET_NAME:synthetic-google-secret RAZORPAY_KEY_SECRET_NAME:synthetic-razorpay-secret RAZORPAY_WEBHOOK_SECRET_NAME:synthetic-webhook-secret; do
  variable=${entry%%:*}; value=${entry#*:}
  printf '%s' "$value" | docker secret create "${!variable}" -
done
sed -e "s/\${LETSENCRYPT_EMAIL}/$LETSENCRYPT_EMAIL/g" -e "s|\${ACME_CA_SERVER}|$ACME_CA_SERVER|g" infra/staging/traefik/static.yml.tmpl >"$fixture/traefik.yml"
docker config create "$TRAEFIK_STATIC_CONFIG" "$fixture/traefik.yml"
docker config create "$TRAEFIK_DYNAMIC_CONFIG" infra/staging/traefik/dynamic.yml
docker stack deploy --with-registry-auth -c infra/staging/stack.yml "$STACK_NAME"
docker service create --detach=true --name staging-key-fixture --restart-condition none --no-healthcheck \
  --network tickif_backend "$API_IMAGE" node -e '
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
    case "$state" in
      failed|rejected)
        echo "Typesense search-key fixture entered $state" >&2
        docker service ps staging-key-fixture --no-trunc >&2 || true
        docker service logs staging-key-fixture --tail 50 >&2 || true
        exit 1
        ;;
    esac
  fi
  sleep 2
done
"$key_ready" || exit 1
docker service rm staging-key-fixture

export -p >"$fixture/env"
bash infra/staging/scripts/deploy.sh "$fixture/env"
# The actual worker process must stay unready when its Redis authentication fails.
docker service update --detach=true --update-order stop-first --update-failure-action pause \
  --env-add REDIS_URL=redis://:synthetic-invalid-password@redis:6379 "${STACK_NAME}_worker"
bad_worker_observed=false
for ((i=0;i<90;i++)); do
  worker=$(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_worker")
  if [[ -n "$worker" ]]; then
    response=$(docker exec "$worker" node -e "Promise.all(['/livez','/readyz'].map(p=>fetch('http://127.0.0.1:3002'+p).then(r=>r.status))).then(s=>console.log(s.join(','))).catch(()=>process.exit(1))" 2>/dev/null || true)
    if [[ "$response" == 200,503 ]]; then bad_worker_observed=true; break; fi
  fi
  sleep 2
done
"$bad_worker_observed" || { echo 'Bad Redis credentials did not fail worker readiness' >&2; exit 1; }
docker service update --detach=true --env-rm REDIS_URL --force "${STACK_NAME}_worker"
source infra/staging/scripts/lib.sh
wait_healthy worker 1
good_secret=$BETTER_AUTH_SECRET_NAME
export BETTER_AUTH_SECRET_NAME=tickif_staging_invalid
printf '%s' too-short | docker secret create "$BETTER_AUTH_SECRET_NAME" -
export -p >"$fixture/invalid-env"
if bash infra/staging/scripts/deploy.sh "$fixture/invalid-env"; then echo 'Invalid secret passed release' >&2; exit 1; fi
for service in traefik api web worker; do
  [[ "$(docker service inspect "${STACK_NAME}_$service" --format '{{.Spec.Mode.Replicated.Replicas}}')" == 0 ]]
done
export BETTER_AUTH_SECRET_NAME=$good_secret
export -p >"$fixture/env"
bash infra/staging/scripts/deploy.sh "$fixture/env"
for service in api worker web; do
  port=3001; route=readyz
  [[ "$service" == worker ]] && port=3002
  [[ "$service" == web ]] && { port=3000; route=health; }
  container=$(docker ps -q --filter "label=com.docker.swarm.service.name=${STACK_NAME}_$service")
  docker exec "$container" node -e "fetch('http://127.0.0.1:$port/$route').then(r=>{if(!r.ok)process.exit(1)})"
done
# Run the real Traefik/socket-proxy pair; .invalid test hostname never requests a real certificate.
docker service scale --detach=true "${STACK_NAME}_traefik=1"
source infra/staging/scripts/lib.sh
wait_healthy traefik 1
curl -fsS --retry 20 --retry-all-errors --retry-delay 2 -k --resolve "$STAGING_HOST:443:127.0.0.1" "https://$STAGING_HOST/readyz"
curl -fsS -k --resolve "$STAGING_HOST:443:127.0.0.1" "https://$STAGING_HOST/login" >/dev/null
docker service scale --detach=true "${STACK_NAME}_traefik=0"
bash infra/staging/scripts/test-backup.sh
echo 'Two releases, fail-closed recovery, real image readiness and Traefik routing passed. Real ACME/provider/R2 remain unverified.'
