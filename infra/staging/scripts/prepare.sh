#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
load_staging_env "${1:-$DEFAULT_ENV_FILE}"
release_job="${STACK_NAME}_release_$(date +%s)_$RANDOM"
release_job="${release_job:0:63}"
run_swarm_job "$release_job" "$OPERATIONS_IMAGE" \
  --env NODE_ENV=production \
  --env GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" --env GOOGLE_CLIENT_SECRET_FILE=/run/secrets/google_client_secret \
  --env RAZORPAY_KEY_ID="$RAZORPAY_KEY_ID" --env RAZORPAY_KEY_SECRET_FILE=/run/secrets/razorpay_key_secret \
  --env RAZORPAY_WEBHOOK_SECRET_FILE=/run/secrets/razorpay_webhook_secret \
  --secret source="$GOOGLE_CLIENT_SECRET_NAME",target=google_client_secret \
  --secret source="$RAZORPAY_KEY_SECRET_NAME",target=razorpay_key_secret \
  --secret source="$RAZORPAY_WEBHOOK_SECRET_NAME",target=razorpay_webhook_secret \
  --env POSTGRES_HOST=postgres --env POSTGRES_PORT=5432 --env POSTGRES_USER="$POSTGRES_USER" --env POSTGRES_DB="$POSTGRES_DB" \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
  --env REDIS_HOST=redis --env REDIS_PORT=6379 --env REDIS_PASSWORD_FILE=/run/secrets/redis_password \
  --env TYPESENSE_HOST=http://typesense:8108 --env TYPESENSE_API_KEY_FILE=/run/secrets/typesense_admin_key \
  --env TYPESENSE_SEARCH_API_KEY_FILE=/run/secrets/typesense_search_key --env TYPESENSE_COLLECTION_PREFIX="$TYPESENSE_COLLECTION_PREFIX" \
  --env BETTER_AUTH_URL="https://$STAGING_HOST" --env BETTER_AUTH_SECRET_FILE=/run/secrets/better_auth_secret \
  --env R2_ENDPOINT="$R2_ENDPOINT" --env R2_BUCKET="$R2_BUCKET" \
  --env R2_ACCESS_KEY_ID_FILE=/run/secrets/r2_access_key_id --env R2_SECRET_ACCESS_KEY_FILE=/run/secrets/r2_secret_access_key \
  --env RESEND_API_KEY_FILE=/run/secrets/resend_api_key --env EMAIL_FROM="$EMAIL_FROM" \
  --env SMS_PROVIDER="$SMS_PROVIDER" --env NOVU_SECRET_KEY_FILE=/run/secrets/novu_secret \
  --env NOVU_OTP_WORKFLOW_ID="$NOVU_OTP_WORKFLOW_ID" --env NOVU_BOOKING_WORKFLOW_ID="$NOVU_BOOKING_WORKFLOW_ID" --env NOVU_API_URL="$NOVU_API_URL" \
  --secret source="$POSTGRES_PASSWORD_SECRET",target=postgres_password \
  --secret source="$REDIS_PASSWORD_SECRET",target=redis_password \
  --secret source="$TYPESENSE_ADMIN_KEY_SECRET",target=typesense_admin_key \
  --secret source="$TYPESENSE_SEARCH_KEY_SECRET",target=typesense_search_key \
  --secret source="$BETTER_AUTH_SECRET_NAME",target=better_auth_secret \
  --secret source="$NOVU_SECRET_NAME",target=novu_secret \
  --secret source="$R2_ACCESS_KEY_ID_SECRET",target=r2_access_key_id \
  --secret source="$R2_SECRET_ACCESS_KEY_SECRET",target=r2_secret_access_key \
  --secret source="$RESEND_API_KEY_SECRET",target=resend_api_key \
  -- \
  infra/staging/scripts/release-job.sh

