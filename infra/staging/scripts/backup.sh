#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
load_staging_env "${1:-$DEFAULT_ENV_FILE}"
acquire_release_lock
require_variables OPERATIONS_IMAGE POSTGRES_USER POSTGRES_DB R2_ENDPOINT BACKUP_R2_BUCKET \
  POSTGRES_PASSWORD_SECRET R2_ACCESS_KEY_ID_SECRET R2_SECRET_ACCESS_KEY_SECRET BACKUP_AGE_RECIPIENT
assert_immutable_image "$OPERATIONS_IMAGE"

run_swarm_job "${STACK_NAME}_backup_$(date +%s)" "$OPERATIONS_IMAGE" \
  --env BACKUP_ACTION=backup --env POSTGRES_HOST=postgres --env POSTGRES_USER="$POSTGRES_USER" --env POSTGRES_DB="$POSTGRES_DB" \
  --env R2_ENDPOINT="$R2_ENDPOINT" --env BACKUP_R2_BUCKET="$BACKUP_R2_BUCKET" \
  --secret source="$POSTGRES_PASSWORD_SECRET",target=postgres_password \
  --secret source="$R2_ACCESS_KEY_ID_SECRET",target=r2_access_key_id \
  --secret source="$R2_SECRET_ACCESS_KEY_SECRET",target=r2_secret_access_key \
  --env BACKUP_AGE_RECIPIENT="$BACKUP_AGE_RECIPIENT" \
  -- \
  infra/staging/scripts/backup-job.sh
