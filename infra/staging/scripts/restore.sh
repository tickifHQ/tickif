#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${1:-}" != "--confirm" || "${2:-}" != "tickif" || -z "${3:-}" ]]; then
  echo "usage: restore.sh --confirm tickif <postgres/object.dump.age> [env-file]" >&2
  exit 2
fi
backup_object="$3"
env_file="${4:-/opt/tickif/staging.env}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_staging_env "$env_file"
require_variables OPERATIONS_IMAGE POSTGRES_USER POSTGRES_DB R2_ENDPOINT BACKUP_R2_BUCKET \
  POSTGRES_PASSWORD_SECRET R2_ACCESS_KEY_ID_SECRET R2_SECRET_ACCESS_KEY_SECRET BACKUP_ENCRYPTION_KEY_SECRET

acquire_release_lock
assert_single_manager
assert_immutable_image "$OPERATIONS_IMAGE"
declare -A previous_replicas
for service in traefik api web worker; do
  previous_replicas[$service]=$(docker service inspect "${STACK_NAME}_$service" --format '{{.Spec.Mode.Replicated.Replicas}}')
done
fail_closed() {
  code=$?
  if (( code != 0 )); then close_traffic; echo 'Restore failed; traffic remains stopped for operator recovery' >&2; fi
}
trap fail_closed EXIT
close_traffic
wait_stopped

run_swarm_job "${STACK_NAME}_restore_$(date +%s)" "$OPERATIONS_IMAGE" \
  --env BACKUP_ACTION=restore --env BACKUP_OBJECT="$backup_object" \
  --env POSTGRES_HOST=postgres --env POSTGRES_USER="$POSTGRES_USER" --env POSTGRES_DB="$POSTGRES_DB" \
  --env R2_ENDPOINT="$R2_ENDPOINT" --env BACKUP_R2_BUCKET="$BACKUP_R2_BUCKET" \
  --secret source="$POSTGRES_PASSWORD_SECRET",target=postgres_password \
  --secret source="$R2_ACCESS_KEY_ID_SECRET",target=r2_access_key_id \
  --secret source="$R2_SECRET_ACCESS_KEY_SECRET",target=r2_secret_access_key \
  --secret source="$BACKUP_ENCRYPTION_KEY_SECRET",target=backup_encryption_key \
  -- \
  infra/staging/scripts/backup-job.sh

# Restore can contain an older schema: migrate and rebuild search synchronously
# with this reviewed release's operations image before accepting writes.
bash "$SCRIPT_DIR/prepare.sh" "$env_file"
for service in worker api web traefik; do
  count=${previous_replicas[$service]}
  docker service scale --detach=true "${STACK_NAME}_$service=$count"
  if (( count > 0 )); then wait_healthy "$service" "$count"; fi
done
if (( previous_replicas[traefik] > 0 )); then
  bash "$SCRIPT_DIR/smoke-test.sh" "https://$STAGING_HOST"
fi
