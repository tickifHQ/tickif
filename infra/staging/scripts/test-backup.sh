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
docker exec backup-fixture-postgres psql -U postgres -d fixture -c "CREATE TABLE proof (value text); INSERT INTO proof VALUES ('original');"
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
docker exec backup-fixture-postgres psql -U postgres -d fixture -c "UPDATE proof SET value='changed';"
run_job restore "postgres/$object"
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc 'SELECT value FROM proof')" == original ]]
# Truncation must fail authentication before any database writes.
truncate -s -16 "$fixture/objects/$object"
if run_job restore "postgres/$object"; then echo 'Corrupted backup restored unexpectedly' >&2; exit 1; fi
[[ "$(docker exec backup-fixture-postgres psql -U postgres -d fixture -Atc 'SELECT value FROM proof')" == original ]]
if run_job restore postgres/legacy.dump.enc; then echo 'Legacy CBC accepted unexpectedly' >&2; exit 1; fi
echo 'PostgreSQL backup, age recovery and corrupt/legacy rejection passed; R2 transport was a local fixture.'
