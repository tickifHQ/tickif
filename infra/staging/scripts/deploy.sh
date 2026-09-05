#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_staging_env "${1:-$DEFAULT_ENV_FILE}"
acquire_release_lock
assert_single_manager
[[ "${RAZORPAY_KEY_ID:-}" == rzp_test_* ]] || { echo 'Staging requires Razorpay test mode' >&2; exit 1; }
require_variables GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET_NAME RAZORPAY_KEY_SECRET_NAME RAZORPAY_WEBHOOK_SECRET_NAME


require_variables \
  STAGING_HOST LETSENCRYPT_EMAIL API_IMAGE WEB_IMAGE WORKER_IMAGE OPERATIONS_IMAGE \
  POSTGRES_USER POSTGRES_DB TYPESENSE_COLLECTION_PREFIX R2_ENDPOINT R2_BUCKET EMAIL_FROM \
  SMS_PROVIDER NOVU_OTP_WORKFLOW_ID NOVU_BOOKING_WORKFLOW_ID NOVU_API_URL \
  POSTGRES_PASSWORD_SECRET REDIS_PASSWORD_SECRET TYPESENSE_ADMIN_KEY_SECRET \
  TYPESENSE_SEARCH_KEY_SECRET BETTER_AUTH_SECRET_NAME NOVU_SECRET_NAME \
  R2_ACCESS_KEY_ID_SECRET R2_SECRET_ACCESS_KEY_SECRET RESEND_API_KEY_SECRET

for image in "$API_IMAGE" "$WEB_IMAGE" "$WORKER_IMAGE" "$OPERATIONS_IMAGE"; do
  assert_immutable_image "$image"
done

for name in \
  "$POSTGRES_PASSWORD_SECRET" "$REDIS_PASSWORD_SECRET" "$TYPESENSE_ADMIN_KEY_SECRET" \
  "$TYPESENSE_SEARCH_KEY_SECRET" "$BETTER_AUTH_SECRET_NAME" "$NOVU_SECRET_NAME" \
  "$R2_ACCESS_KEY_ID_SECRET" "$R2_SECRET_ACCESS_KEY_SECRET" "$RESEND_API_KEY_SECRET"; do
  if ! secret_exists "$name"; then
    echo "required external Swarm secret does not exist: $name" >&2
    exit 1
  fi
done

render_dir="$(mktemp -d)"
finish() {
  code=$?
  rm -rf -- "$render_dir"
  if (( code != 0 )); then close_traffic; echo 'Release failed; traffic remains closed' >&2; fi
}
trap finish EXIT
sed -e "s|\${LETSENCRYPT_EMAIL}|${LETSENCRYPT_EMAIL//|/\\|}|g" \
  -e "s|\${ACME_CA_SERVER}|${ACME_CA_SERVER:-https://acme-v02.api.letsencrypt.org/directory}|g" \
  "$STAGING_DIR/traefik/static.yml.tmpl" >"$render_dir/static.yml"
cp "$STAGING_DIR/traefik/dynamic.yml" "$render_dir/dynamic.yml"

static_hash="$(sha256sum "$render_dir/static.yml" | cut -c1-12)"
dynamic_hash="$(sha256sum "$render_dir/dynamic.yml" | cut -c1-12)"
export TRAEFIK_STATIC_CONFIG="tickif_staging_traefik_static_${static_hash}"
export TRAEFIK_DYNAMIC_CONFIG="tickif_staging_traefik_dynamic_${dynamic_hash}"
docker config inspect "$TRAEFIK_STATIC_CONFIG" >/dev/null 2>&1 || \
  docker config create "$TRAEFIK_STATIC_CONFIG" "$render_dir/static.yml" >/dev/null
docker config inspect "$TRAEFIK_DYNAMIC_CONFIG" >/dev/null 2>&1 || \
  docker config create "$TRAEFIK_DYNAMIC_CONFIG" "$render_dir/dynamic.yml" >/dev/null

stack_file="$STAGING_DIR/stack.yml"
docker stack config --compose-file "$stack_file" >/dev/null

echo "[deploy] closing traffic and all writers before preparation"
close_traffic
wait_stopped
export WEB_REPLICAS=0 API_REPLICAS=0 WORKER_REPLICAS=0 TRAEFIK_REPLICAS=0
docker stack deploy --with-registry-auth --prune --compose-file "$stack_file" "$STACK_NAME"
for service in postgres redis typesense socket-proxy; do wait_healthy "$service" 1; done
bash "$SCRIPT_DIR/prepare.sh" "${1:-$DEFAULT_ENV_FILE}"
for service in worker api web; do
  variable="DESIRED_${service^^}_REPLICAS"
  default=2; [[ "$service" == worker ]] && default=1
  count="${!variable:-$default}"
  docker service scale --detach=true "${STACK_NAME}_${service}=$count"
  wait_healthy "$service" "$count"
done
if [[ "${HOLD_TRAFFIC:-false}" == true ]]; then
  echo '[deploy] internal readiness passed; ingress intentionally closed'
  exit 0
fi
docker service scale --detach=true "${STACK_NAME}_traefik=1"
wait_healthy traefik 1
bash "$SCRIPT_DIR/smoke-test.sh" "https://$STAGING_HOST"
