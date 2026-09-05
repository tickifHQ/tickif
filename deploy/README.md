# Azure VM staging release

This deploys the API, standalone Next.js web, worker, PostgreSQL, Redis and
Typesense as a Docker Swarm stack on **one Linux Azure VM**. Caddy terminates HTTPS
on the single public staging origin. PostgreSQL, Redis, Typesense and worker ports
are never published. This is persistent staging, not a highly available cluster:
all services are pinned to one explicitly labeled manager because Docker local
volumes do not follow a task to another node.

## Prepare the VM and providers

Use a supported Linux VM with Docker Engine, Bash, curl and util-linux (`flock`),
at least 4 vCPU / 8 GiB for the initial low-concurrency workload, and a persistent
managed disk with monitored free space for Docker volumes. Measure real media and
search load before sizing production. Keep a separate off-VM backup destination.
Set an Azure NSG to allow inbound TCP 80/443 and restrict SSH to the operator's
source IP or Azure Bastion. Do not expose 5432, 6379, 8108, 3000–3002, Docker API,
or Swarm control ports to the internet. DNS must point the staging domain to the
VM's static public IP. Allow outbound DNS and HTTPS for certificates and providers.

On the intended VM only, initialize Swarm using its private NIC address if it is
not already initialized, then label the current manager:

```bash
docker swarm init --advertise-addr <vm-private-ip>
docker node update --label-add tickif.staging=true "$(docker info --format '{{.Swarm.NodeID}}')"
```

Do not run initialization against the shared developer daemon. `release.sh`
refuses to initialize Swarm and requires exactly the local manager to have the
label. Adding more nodes requires a separate storage/HA design.

Provision a private staging R2 bucket using the existing `infra/` Terraform and
its CORS/lifecycle configuration. CORS must allow the exact HTTPS web origin for
direct PUT requests. Keep originals and verification documents private. Set
`R2_ACCOUNT_ID` and leave `R2_ENDPOINT` unset: production rejects MinIO, localhost,
IP literals, non-HTTPS origins and non-Cloudflare endpoints. Local dev/tests retain
MinIO support. This manifest intentionally has no MinIO service.

Configure dedicated staging Google OAuth credentials (authorized JavaScript
origin `https://<domain>` and callback
`https://<domain>/api/auth/callback/google`), Novu OTP/booking workflows, a verified
Resend sender, and **Razorpay test-mode** plans/webhook. Use the webhook endpoint
`https://<domain>/api/billing/webhook`. Do not reuse live payment keys or production user data.

## Runtime secrets

Keep credentials outside the checkout and out of shell history. Use `umask 077`
when creating local preparation files. Copy `app-credentials.example` into a
private file and replace every placeholder through your secret manager. Only
listed secret keys are accepted; ordinary settings stay in the public environment.
`CONFIG_SECRETS_FILE` loads the dotenv secret without mutating `process.env`, and
both config parsing and email/search startup checks consume its values. A secret
key present in both the file and the environment is rejected. Never print the
file or run a shell with tracing while handling secrets.

Create four versioned external Docker secrets using private file paths:

```bash
docker secret create tickif_staging_app_v1 /secure/tickif/app-credentials
docker secret create tickif_staging_postgres_v1 /secure/tickif/postgres-password
docker secret create tickif_staging_redis_v1 /secure/tickif/redis.conf
docker secret create tickif_staging_typesense_v1 /secure/tickif/typesense.ini
```

The Postgres file contains only the password, matching `POSTGRES_PASSWORD` in the
app credential file. Redis config contains `appendonly yes`, `maxmemory 512mb`,
`maxmemory-policy noeviction`, and `requirepass <random-password>`; put its
URL-encoded password in the app's `REDIS_URL=redis://:<password>@redis:6379/0`.
Typesense INI contains a `[server]` section with `data-dir = /data` and
`api-key = <random-admin-key>`; match
that key in the app credential file. Keep the search-only key distinct.

Create the search-only key using the Typesense keys API from inside the private
network, restricted to `documents:search` on regex `tickif_staging_.*`, and place its
returned value in the app secret. For an initial deployment, `docker stack deploy`
with this manifest starts only infrastructure (all app services have zero
replicas), allowing key provisioning before `release.sh`. See the existing
[search runbook](../docs/runbooks/search.md) for scoped key creation. Do not log
the key creation response. A distinct string alone does not grant search access.

Docker secrets/configs are immutable. Rotate by creating new versioned names and
updating the public release environment. Changing Postgres's password file alone
does **not** rotate an initialized database password: coordinate SQL role password
rotation and app secret replacement in a maintenance window. Redis and Typesense
credential rotation likewise requires a coordinated restart. Retain old secret
versions until the rollback window closes. The app mount is readable only by its
UID 1001; web and Caddy receive no provider or database secrets.

## Build and release

Use a clean reviewed commit containing all approved feature changes. Copy
`staging.env.example` outside the repository and configure public values and
versioned secret names. This file uses shell assignments; only source a trusted
operator-maintained copy. Do not add credentials to it.

```bash
set -a
source /secure/tickif/staging.env
set +a
export REGISTRY=<registry-host>/tickif
bash deploy/build.sh
# Authenticate to your private registry with its approved credential helper.
# Push api, worker and web tags printed by build.sh. Record their returned digests
# as API_IMAGE, WORKER_IMAGE and WEB_IMAGE in /secure/tickif/staging.env. Resolve
# and record immutable digests for the four infrastructure images as well.
```

Next.js embeds `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WEB_URL` during the image
build. Both must equal the staging HTTPS origin. Changing the domain requires a
new web image; changing runtime secrets does not. The web image contains traced
standalone dependencies plus `public` and `.next/static`. API/worker images retain
workspace dependencies and migration sources so the one-shot prepare task can
run pnpm/drizzle/tsx without downloading dependencies at release time. Image
slimming is a future optimization. `.dockerignore` excludes nested `.env*`, key
files, secrets directories and build/test output.

On the VM, authenticate to the registry, check out the same release commit, load
the public environment, take the backup below, then run:

```bash
bash deploy/release.sh
```

The script serializes releases with `flock`, verifies application and infrastructure
image digests and test-mode
billing, closes edge/API/web/worker replicas, and waits for old writer containers
to stop. It deploys infrastructure, runs a fresh one-shot prepare task, waits for
authenticated DB/Redis/search connectivity, applies committed migrations, seeds
taxonomy, applies compatible search schema updates, and **awaits the full search
rebuild and alias swap**. Only then does it start worker → API → web, wait for
container health (worker `/readyz`), open Caddy and verify public HTTPS health/login.
There is no `depends_on` assumption and no queue-enqueue-as-completion shortcut.
An incompatible search schema change requires the search rebuild runbook; the
release aborts instead of inventing a destructive migration.

The operation takes a maintenance window. On failure, traffic stays closed;
inspect `docker service ps tickif-staging_prepare --no-trunc` and restricted
service logs, then fix and rerun or follow rollback. A completed older prepare
task cannot satisfy the next release. `--hold-traffic` performs preparation and
internal health checks while leaving Caddy at zero replicas; it is useful for
private acceptance testing. A normal release reruns the idempotent preparation
before opening traffic. Do not use an ad hoc `docker stack deploy` to roll out
application images: manifest app replica counts deliberately default to zero.

Provision the first superadmin using the existing
[admin provisioning runbook](../docs/runbooks/admin-access.md) after the
initial migration; never promote a user through an unrestricted public endpoint.

## Backups and rollback

Before releasing, save the prior checkout SHA, public environment/image digests,
secret names, Typesense alias targets, and an encrypted off-VM database backup.
For a consistent recovery point, scale edge/API/web/worker to zero and wait for
writers to stop first. Do not remove the stack's volumes.

```bash
docker service scale tickif-staging_edge=0 tickif-staging_api=0 \
  tickif-staging_web=0 tickif-staging_worker=0
db=$(docker ps -q --filter label=com.docker.swarm.service.name=tickif-staging_postgres)
docker exec "$db" pg_dump -U tickif -d tickif_staging -Fc > /secure/backups/tickif-before-release.dump
docker exec "$db" pg_dumpall -U tickif --globals-only > /secure/backups/tickif-roles.sql
```

Encrypt and transfer these files to the backup destination; role dumps contain
password hashes. Back up the Redis persistent volume with Redis stopped, and the
Caddy `/data` volume for certificate account state. PostgreSQL is the search
source of truth, so Typesense can be rebuilt; preserve old alias targets/collections
through the rollback window. Back up required private R2 objects using the
organization's retention policy; a DB restore cannot recover deleted objects.
Test restoration to an isolated database before relying on the backup.

If migrations remain backward compatible, restore the prior code checkout and
public environment/digests, then run its reviewed release process. Do not rely on
`docker service rollback` alone: it cannot undo schema changes or coordinate three
images and search aliases. If a schema change is incompatible, keep traffic
closed, restore the DB backup into a **new recovery database**, validate it, point
an updated app secret's `DATABASE_URL` at that database (remove the old duplicate
POSTGRES_PASSWORD source only if appropriate), and rebuild Typesense from that
DB using the matching application release. Restore/reconcile Redis queued jobs
against the same recovery point before allowing workers to consume them. Obtain
the operator's recovery approval before discarding data created since the backup.

## Acceptance evidence

The `Staging images` PR workflow builds all three images without runtime secrets,
initializes Swarm only on a disposable GitHub-hosted runner, mounts synthetic
credentials, runs two complete releases with traffic held closed, and checks API,
worker, standalone HTML/static references and the Caddy configuration. It does
not claim Azure DNS, public TLS or real provider connectivity are validated.

After the real staging environment is configured, record the release SHA and:

- Public HTTPS `/health` and `/login`, certificate trust, and HTTP → HTTPS redirect.
- Phone OTP, email OTP and Google sign-in using designated staging accounts.
- A real Razorpay **test-mode** checkout and signed callback/webhook, checking
  idempotency and payment history. Never use a live card or live payment keys.
- Browser direct R2 upload → worker processing → rendered derivative; unsigned
  originals/verification documents denied and signed links expire as expected.
- A published project visible through a search-only key, worker `/readyz` healthy,
  and no stuck/failed media or search jobs. Run the critical journey E2E suite.
- Restart API/worker/web and confirm sessions, DB content and search remain intact;
  perform a backup restore drill into isolated infrastructure.

Local MinIO tests cover S3-compatible behavior only. **Actual Azure deployment,
TLS issuance, real provider callbacks and R2 CORS/upload smoke remain external
acceptance checks until a staging URL and provider environment are available.**

References: [Docker stack deployment](https://docs.docker.com/engine/swarm/stack-deploy/),
[Docker secrets](https://docs.docker.com/engine/swarm/secrets/),
[Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[Azure NSG behavior](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works),
[Typesense server config](https://typesense.org/docs/30.2/api/server-configuration.html),
[Cloudflare R2 S3 endpoints](https://developers.cloudflare.com/r2/api/s3/api/).
