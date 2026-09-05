# Staging deployment (Docker Swarm + Traefik)

Tickif staging is a single Swarm stack named `tickif`. Traefik is the only
public service and publishes ports 80/443. API, web, worker health, Postgres,
Redis, Typesense, Docker socket proxy, and Traefik ping ports remain private.
Cloudflare R2 stays external; staging does not run MinIO.

## Host, DNS, and registry prerequisites

Use a supported Linux Docker Engine host (or swarm) with a manager and a durable
node for state. Point the staging hostname's A/AAAA record at the ingress node,
allow inbound TCP 80/443, and restrict SSH to operator/CI addresses. Port 80 must
remain reachable for Let's Encrypt HTTP-01 renewals.

Initialize and label the nodes once:

```bash
docker swarm init
docker node update --label-add tickif.stateful=true NODE_NAME
docker node update --label-add tickif.traefik=true NODE_NAME
install -d -m 750 /opt/tickif/releases
```

The Traefik label should remain on one durable manager because the single ACME
volume is node-local. The stateful label pins Postgres, Redis, and Typesense to
the node that owns their named volumes. Release and restore scripts require one
manager; multi-node storage and health verification need a separate design.

Log the manager into GHCR with a read-only token so `docker stack deploy
--with-registry-auth` can distribute private images:

```bash
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u GITHUB_USER --password-stdin
```

Repository variable `STAGING_HOST` supplies the same-origin URL embedded into
the web bundle at image build time. Changing it requires rebuilding the web
image; changing only the container environment cannot update `NEXT_PUBLIC_*`.

## Non-secret configuration and secrets

Copy `infra/staging/.env.example` to `/opt/tickif/staging.env`, fill every
non-secret value and external secret object name, then `chmod 600` it. Image
references must be a full commit-SHA tag or registry digest; `latest` is rejected.

Create random values without putting them in a command argument or the file:

```bash
read -rsp 'Secret value: ' value; echo
printf '%s' "$value" | docker secret create tickif_staging_better_auth_secret_v1 -
unset value
```

Create all secret objects named by the environment file:

- Postgres password; Redis password.
- Typesense admin key and a distinct search-only key (minimum 16 characters).
- better-auth secret (at least 32 random bytes).
- Novu secret, R2 access-key ID/secret, and Resend API key.
- Google OAuth client secret and Razorpay test-mode API/webhook secrets.
- An age public recipient for backups; keep its private identity offline and mount it only for restores.

Secrets are external and versioned. To rotate, create a `_v2` object, change the
name in `/opt/tickif/staging.env`, deploy, verify, then remove `_v1`. Swarm grants
runtime secrets only to consumers: Postgres gets its password, Typesense its
admin key, and API/worker get only their application credentials. Backup secrets
are attached only to short-lived backup/restore jobs. No secret value belongs in
Git, GitHub variables, the stack manifest, or the non-secret environment file.

For R2, use a staging media bucket with browser CORS configured for the exact
staging origin. Use a separate backup bucket and preferably separate restricted
credentials. Apply retention/versioning policies appropriate for recovery.

## Release flow

CI runs typecheck, lint, tests, build, migrations/drift validation, then publishes
four GHCR images tagged with the full commit SHA: API, web, worker, and operations.
The deployment workflow uses the protected `staging` GitHub environment. Configure:

- Secrets: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_PRIVATE_KEY`,
  and pinned `STAGING_SSH_KNOWN_HOSTS`.
- Variables: `STAGING_HOST` and optionally `STAGING_SCROLL_GATE_LIMIT`.
- Environment reviewers if staging changes require approval.

After successful main CI, deployment automatically uploads only the staging
infrastructure files and invokes `scripts/deploy.sh`. Manual workflow dispatch
requires the exact 40-character SHA. Every release rebuilds search synchronously.

The deployment is explicitly migration-first:

1. Acquire the shared release/restore lock, close Traefik, and stop all API/web/worker writers. Wait until their containers stop.
2. Deploy private infrastructure with all application and ingress replicas zero.
3. From the operations image, wait for authenticated database/Redis/search readiness, migrate, seed, bootstrap, and synchronously rebuild search with alias swaps. Validate the actual search-only key.
4. Start worker, API, and web; wait for container readiness. Open Traefik only after all pass, then run HTTPS smoke tests.

`depends_on` is intentionally absent because Swarm ignores Compose startup
ordering. Stateless services retain automatic task rollback settings, but release
failures keep traffic closed. Database migrations are not automatically reversed;
assess schema compatibility before redeploying an earlier application image.

Manual host invocation:

```bash
cd /opt/tickif/releases/FULL_SHA
bash infra/staging/scripts/deploy.sh /opt/tickif/staging.env
```

Desired replicas use `DESIRED_API_REPLICAS`, `DESIRED_WEB_REPLICAS`, and `DESIRED_WORKER_REPLICAS`; defaults are 2/2/1. `HOLD_TRAFFIC=true` leaves Traefik closed after internal readiness. Any failure leaves ingress and writers stopped. This release has an intentional maintenance window.

## Routing, health, and inspection

Traefik 3.7 uses the Swarm provider through a private, manager-pinned,
least-privilege socket proxy. Traefik never mounts `docker.sock`. Discovery is
opt-in (`exposedByDefault=false`), the dashboard/API are disabled, and its ping
entry point is private. JSON access logs drop most headers and redact credential
headers. ACME state is on the single-replica persistent volume.

The higher-priority API router owns `/api`, `/docs`, `/openapi.json`, `/health`,
`/livez`, and `/readyz`; the lower-priority web router owns the remaining host
traffic. Backend ports 3001 and 3000 are explicit in `deploy.labels`.

- API `/livez`: process is running; no dependency checks.
- API `/readyz` and compatibility `/health`: 200 only when accepting traffic and Postgres responds.
- Redis and Typesense failures remain degraded/non-fatal to API readiness by design.
- Worker `/livez` and `/readyz` remain private on port 3002; shutdown allows two minutes to drain jobs.
- Web `/health`: standalone Next.js server is answering.

Useful checks:

```bash
docker stack services tickif
docker stack ps tickif --no-trunc
docker service logs --since 15m tickif_traefik
docker service logs --since 15m tickif_api
bash infra/staging/scripts/smoke-test.sh https://staging.example.com
```

## Backups and restore

Run encrypted, off-host Postgres backups from a release directory (schedule this
with a root-owned systemd timer or equivalent):

```bash
bash infra/staging/scripts/backup.sh /opt/tickif/staging.env
```

The operations image writes a custom-format dump into a private temporary directory, checks its table of contents, encrypts it with [age](https://github.com/FiloSottile/age), and uploads the authenticated `.dump.age` file to R2. Plaintext is removed on exit; allow temporary space for a full dump plus ciphertext. Monitor uploads and schedule backups externally.

Generate an identity offline with `age-keygen -o backup-identity.txt`. Put its public recipient in `BACKUP_AGE_RECIPIENT`; keep the private identity separately from the VM. Only restore jobs receive `BACKUP_ENCRYPTION_KEY_SECRET` containing that identity. Losing it makes backups unrecoverable.

Restore authenticates the **whole** downloaded file before any database write, checks the archive table of contents, then uses `pg_restore --single-transaction --exit-on-error`. It captures actual replica counts and stops ingress and writers. Only successful restore, migration/search rebuild and readiness checks permit those counts to resume. Any failure leaves traffic stopped. SQL failure rolls back the restore transaction; a later migration/search failure requires operator investigation.

Legacy `.dump.enc` CBC files are explicitly rejected and must never be renamed to `.age`. If any exist, preserve the original, decrypt offline with the historical key/settings into an isolated recovery database, verify contents against independently trusted evidence, then create a fresh authenticated backup. No automatic conversion or trust claim is made.

CI checks PostgreSQL recovery and corruption rejection with a local file transport. Real off-host R2 transfer, permissions, retention and a restore drill remain staging acceptance work.

Restore requires an explicit confirmation argument:

```bash
bash infra/staging/scripts/restore.sh --confirm tickif \
  postgres/tickif-YYYYMMDDTHHMMSSZ-ID.dump.age /opt/tickif/staging.env
```

Redis AOF is durable for ordinary restarts but is not the authoritative backup;
after Redis loss, sessions/caches expire and BullMQ pending work may need replay
from authoritative database/outbox state. Typesense is also derived state: after
volume loss, run normal deployment, which always bootstraps and rebuilds search.
Postgres is authoritative and must be restored first.

## Rollback and incident notes

Swarm automatically rolls failed stateless updates back to the prior task spec.
For an operator rollback, rerun the protected workflow with a previously published
SHA. Do not roll an app back across an incompatible database contract migration.
If Traefik cannot issue certificates, verify DNS/ports, its node placement, and
the `tickif_staging_traefik_acme` volume before deleting anything; deleting ACME
state can trigger CA rate limits. Never publish the proxy, ping, stateful, or
worker health ports while troubleshooting.

## Reconciled target and outstanding proof

This preserves the approved Traefik/socket proxy, four images, individual `*_FILE`
secrets, health/drain behavior and protected GitHub deployment. The competing
`deploy/` Caddy proposal was removed. `CONFIG_SECRETS_FILE` remains a compatible
optional config API. Production R2 origins require HTTPS Cloudflare account
endpoints; MinIO remains available in development/tests.

The intended host is `staging.tickif.com`, Azure Central India, Ubuntu 24.04,
Standard_D4as_v5 (4 vCPU/16 GiB), with a 128 GiB Docker data disk at `/var/lib/docker`.
This is documented intent, not evidence of provisioning. Live DNS/ACME, protected
SSH deployment, GHCR pull permissions, Google/Razorpay callbacks, email/SMS, R2
media and a real off-host restore drill must be verified there. PR validation
does not deploy to Azure.
