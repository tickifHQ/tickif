#!/usr/bin/env bash
# Real PostgreSQL + age exercise; R2 transfer uses a local file transport fixture.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || exit 1
: "${OPERATIONS_IMAGE:?}"
fixture=$(mktemp -d)
cleanup() {
  docker rm -f backup-fixture-postgres >/dev/null 2>&1 || true
  docker network rm backup-fixture >/dev/null 2>&1 || true
  rm -rf -- "$fixture"
}
trap cleanup EXIT
chmod 777 "$fixture"
mkdir -p "$fixture/bin" "$fixture/objects" "$fixture/secrets"
chmod 777 "$fixture/objects"
printf '%s' fixture-password >"$fixture/secrets/postgres_password"
printf '%s' synthetic >"$fixture/secrets/r2_access_key_id"
printf '%s' synthetic >"$fixture/secrets/r2_secret_access_key"
cat >"$fixture/bin/rclone" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == copyto ]] || exit 2
source=$2; destination=$3
[[ "$source" == tickif:* ]] && source="/fixture/objects/${source##*/}"
[[ "$destination" == tickif:* ]] && destination="/fixture/objects/${destination##*/}"
cp "$source" "$destination"
MOCK
chmod 755 "$fixture/bin/rclone"
docker run --rm -v "$fixture:/fixture" --entrypoint bash "$OPERATIONS_IMAGE" -c 'age-keygen -o /fixture/identity; age-keygen -y /fixture/identity >/fixture/recipient'
cp "$fixture/identity" "$fixture/secrets/backup_encryption_key"
chmod 644 "$fixture/secrets/backup_encryption_key"
docker network create backup-fixture
docker run -d --name backup-fixture-postgres --network backup-fixture -e POSTGRES_PASSWORD=fixture-password -e POSTGRES_DB=fixture postgres:16-bookworm
for ((i=0;i<60;i++)); do docker exec backup-fixture-postgres pg_isready -U postgres && break; sleep 1; done
docker exec backup-fixture-postgres psql -U postgres -d fixture -c "CREATE TABLE proof (value text PRIMARY KEY); INSERT INTO proof VALUES ('original'); CREATE TABLE migration_journal (version int); INSERT INTO migration_journal VALUES (1);"
run_job() {
  docker run --rm --network backup-fixture -v "$fixture:/fixture" -v "$fixture/secrets:/run/secrets:ro" \
    -e POSTGRES_HOST=backup-fixture-postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=fixture \
    -e R2_ENDPOINT=https://00000000000000000000000000000000.r2.cloudflarestorage.com \
    -e BACKUP_R2_BUCKET=fixture -e BACKUP_ACTION="$1" -e BACKUP_OBJECT="${2:-}" \
    -e BACKUP_AGE_RECIPIENT="$(cat "$fixture/recipient")" --entrypoint bash "$OPERATIONS_IMAGE" \
    -c 'export PATH="/fixture/bin:$PATH"; bash infra/staging/scripts/backup-job.sh'
}
run_job backup
object=$(find "$fixture/objects" -type f -name '*.age' -printf '%f\n')
docker exec backup-fixture-postgres psql -U postgres -d fixture -c "UPDATE proof SET value='changed'; CREATE TABLE later (value text REFERENCES proof(value)); INSERT INTO later VALUES ('changed'); INSERT INTO migration_journal VALUES (2);"
run_job restore "postgres/$object"
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc 'SELECT value FROM proof')" == original ]]
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc "SELECT to_regclass('public.later') IS NULL AND (SELECT max(version) FROM migration_journal)=1")" == t ]]
# Reapply a newer migration after restoring the older journal/schema.
docker exec backup-fixture-postgres psql -U postgres -d fixture -v ON_ERROR_STOP=1 -c "CREATE TABLE later (value text REFERENCES proof(value)); INSERT INTO later VALUES ('original'); INSERT INTO migration_journal VALUES (2);"
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc 'SELECT count(*) FROM migration_journal')" == 2 ]]
docker exec -i backup-fixture-postgres psql -U postgres -d postgres <<'SQL'
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname LIKE 'tickif_before_restore_%' AND NOT datallowconn) THEN
    RAISE EXCEPTION 'Previous database was not retained safely';
  END IF;
END $$;
ALTER DATABASE fixture ALLOW_CONNECTIONS false;
\set ON_ERROR_STOP off
BEGIN;
ALTER DATABASE fixture RENAME TO fixture_swap_abort;
-- Expected failure: prove that the first rename rolls back with the second.
ALTER DATABASE deliberately_missing_candidate RENAME TO fixture;
COMMIT;
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='fixture' AND NOT datallowconn)
    OR EXISTS(SELECT 1 FROM pg_database WHERE datname='fixture_swap_abort') THEN
    RAISE EXCEPTION 'Failed name swap left an inconsistent database state';
  END IF;
END $$;
ALTER DATABASE fixture ALLOW_CONNECTIONS true;
SQL
# Truncation must fail authentication before any database writes.
truncate -s -16 "$fixture/objects/$object"
if run_job restore "postgres/$object"; then echo 'Corrupted backup restored unexpectedly' >&2; exit 1; fi
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc 'SELECT value FROM proof')" == original ]]
if run_job restore postgres/legacy.dump.enc; then echo 'Legacy CBC accepted unexpectedly' >&2; exit 1; fi
echo 'PostgreSQL cross-schema recovery, failed-swap rollback and corrupt/legacy rejection passed; R2 transport was a local fixture.'
