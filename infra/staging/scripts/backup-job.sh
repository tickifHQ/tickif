#!/usr/bin/env bash
set -Eeuo pipefail

require_file() {
  [[ -s "$1" ]] || { echo "missing secret file: $1" >&2; exit 1; }
}

require_file /run/secrets/postgres_password
require_file /run/secrets/r2_access_key_id
require_file /run/secrets/r2_secret_access_key

: "${POSTGRES_HOST:?}" "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${R2_ENDPOINT:?}" "${BACKUP_R2_BUCKET:?}"
export PGPASSWORD="$(</run/secrets/postgres_password)"
export RCLONE_CONFIG_TICKIF_TYPE=s3
export RCLONE_CONFIG_TICKIF_PROVIDER=Cloudflare
export RCLONE_CONFIG_TICKIF_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_TICKIF_REGION=auto
export RCLONE_CONFIG_TICKIF_ACCESS_KEY_ID="$(</run/secrets/r2_access_key_id)"
export RCLONE_CONFIG_TICKIF_SECRET_ACCESS_KEY="$(</run/secrets/r2_secret_access_key)"

# R2 origin is validated here too because backup jobs do not load app config.
[[ "$R2_ENDPOINT" =~ ^https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com/?$ ]] || { echo 'Invalid Cloudflare R2 origin' >&2; exit 1; }
umask 077
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
case "${BACKUP_ACTION:-backup}" in
  backup)
    : "${BACKUP_AGE_RECIPIENT:?Supply the public age recipient}"
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    object="postgres/${POSTGRES_DB}-${timestamp}-$RANDOM.dump.age"
    pg_dump --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --format custom --no-owner --no-acl "$POSTGRES_DB" >"$scratch/database.dump"
    pg_restore --list "$scratch/database.dump" >/dev/null
    age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$scratch/database.dump.age" "$scratch/database.dump"
    rclone copyto "$scratch/database.dump.age" "tickif:${BACKUP_R2_BUCKET}/${object}"
    echo "authenticated encrypted backup uploaded: ${object}"
    ;;
  restore)
    : "${BACKUP_OBJECT:?BACKUP_OBJECT is required for restore}"
    [[ "$BACKUP_OBJECT" == postgres/*.dump.age ]] || { echo 'Only authenticated .dump.age backups supported; legacy CBC requires offline migration' >&2; exit 2; }
    require_file /run/secrets/backup_encryption_key
    rclone copyto "tickif:${BACKUP_R2_BUCKET}/${BACKUP_OBJECT}" "$scratch/database.dump.age"
    # Never stream decryption to pg_restore: verify the entire authenticated file first.
    age --decrypt --identity /run/secrets/backup_encryption_key --output "$scratch/database.dump" "$scratch/database.dump.age"
    pg_restore --list "$scratch/database.dump" >/dev/null
    case "$POSTGRES_DB" in postgres|template0|template1) echo 'Refusing to replace a maintenance database' >&2; exit 2 ;; esac
    suffix="$(date -u +%Y%m%d%H%M%S)_$RANDOM"
    candidate="tickif_restore_$suffix"
    preserved="tickif_before_restore_$suffix"
    # --clean alone cannot remove tables/FKs introduced after the backup. Restore
    # into an empty database and keep the previous database for operator recovery.
    createdb --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --template template0 "$candidate"
    pg_restore --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname "$candidate" \
      --single-transaction --no-owner --no-acl --exit-on-error "$scratch/database.dump"
    psql --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname postgres \
      -X --set ON_ERROR_STOP=1 --set active="$POSTGRES_DB" <<'SQL'
ALTER DATABASE :"active" ALLOW_CONNECTIONS false;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'active';
SQL
    psql --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname postgres \
      -X --set ON_ERROR_STOP=1 --set active="$POSTGRES_DB" --set candidate="$candidate" --set preserved="$preserved" <<'SQL'
BEGIN;
ALTER DATABASE :"active" RENAME TO :"preserved";
ALTER DATABASE :"candidate" RENAME TO :"active";
COMMIT;
SQL
    echo "restore completed; previous database retained with connections disabled: $preserved"
    ;;
  *) echo 'unknown backup action' >&2; exit 2 ;;
esac
