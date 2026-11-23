# Production deployment preparation

Decision: [ADR 0022](../adr/0022-production-hosting-and-release-branches.md).

## Current implementation

CI validates and publishes images on `staging` and `main`. Set repository variable
`STAGING_HOST=staging.tickif.com` and `PRODUCTION_HOST=tickif.com`. Optional
`PRODUCTION_SCROLL_GATE_LIMIT` and `PRODUCTION_TELEMETRY_ENABLED` control public
build settings independently of staging. No runtime secrets enter image builds.

Staging deploys after successful CI pushes to `staging`. Manual dispatch must
select the staging branch and a commit reachable from it. The workflow definition
also needs to exist on the default branch for `workflow_run` delivery.

Merge these workflow changes into main and create/update staging through the
normal reviewed Git process. Do not create staging from an uncommitted workspace.
Protect both branches; restrict GitHub environment `staging` to the staging
branch and environment `production` to main.

Production image names retain the GHCR repository layout with
`production-<40-character SHA>` tags. After all images publish, CI records the
lightweight Git tag `v0.1.<CI run number>` on that main commit. Failed builds do
not produce the Git tag. A retried run preserves its version and refuses to move
an existing tag. This version is embedded as `NEXT_PUBLIC_APP_VERSION`.
Tags identify release artifacts, not proof of deployment. The production deploy
path must record the selected version after successful live smoke verification.

## Provisioning and runtime work remaining

### Applied infrastructure — 2026-11-23

The approved AWS infrastructure is provisioned in account `401909805160`, Mumbai
(`ap-south-1`). Terraform reports 32 managed resources and a final plan exit code
of 0 (no changes). Remote state is in the encrypted, versioned bucket
`tickif-terraform-state-401909805160-ap-south-1`, key `production/terraform.tfstate`.

| Resource         | Provisioned configuration                                               |
| ---------------- | ----------------------------------------------------------------------- |
| Application host | `i-0c4119452058c9434`, t3a.large, 8 GiB RAM, 50 GiB encrypted gp3       |
| Static IP        | `13.207.166.134`                                                        |
| PostgreSQL       | `tickif-production`, RDS 16.15, db.t4g.micro, 20 GiB, private Single-AZ |
| Redis            | `tickif-production`, Redis OSS 7.1, cache.t4g.micro, private TLS/AUTH   |
| Secrets          | Three runtime containers plus the RDS-managed administrator secret      |

Verified through SSM: Docker 25.0.18 and Swarm manager active; RDS certificate and
hostname validation passed; Redis rejects unauthenticated access and returns
PONG after authentication over verified TLS. The Redis credential is absent from
Terraform state. The application security group has no inbound rules.

Host preparation is implemented in
[`bootstrap-host.sh`](../../infra/production/bootstrap-host.sh); the read-only
Redis check is [`verify-redis.py`](../../infra/production/verify-redis.py).
The application is not deployed and DNS is unchanged. The branch-routing and
release-tag workflows require a successful main CI run before use. Production
integration verification, SigNoz configuration, billing alarms, public rollout
automation and recovery checks remain outstanding. Restricted application and
migration database roles have been created and their TLS logins verified.

The [production Docker runtime](../../infra/production/README.md) now includes a
private stack, instance-role secret importer, migration-first private release,
search-key registration, and separate billing/ingress overlays. These files are
release preparation, not an applied application release. They require reviewed
main-built production images and GHCR pull access before use. Origin TLS,
Cloudflare/proxy review, production reference data and restore checks remain
before public launch. Private preparation deliberately omits deferred Razorpay
and SigNoz; it never substitutes staging credentials.

The ingress overlay publishes ports in host mode to preserve the Cloudflare
peer address. Traefik trusts forwarded visitor headers only from the published
Cloudflare IPv4/IPv6 ranges in `infra/production/traefik/static.yml`. Refresh these
from https://www.cloudflare.com/ips/ when changing the origin allowlist; verify
distinct visitor IPs and reject spoofed forwarding headers before public launch.

### Operator sequence

The [Terraform configuration and operator procedure](../../infra/production/terraform/README.md)
define the AWS resources. Validate locally, bootstrap protected remote state and
runtime secret values, then review an authenticated plan before applying.
The template initially leaves web ingress closed. It does not deploy the app.

1. Use MFA-authenticated AWS access in Mumbai. Prepare the VPC, public application
   subnet and private database/cache subnet groups. Permit DB/cache ports only
   from the application security group. Avoid NAT and ALB fixed costs.
2. Verify the provisioned resources in ADR 0022, including EC2 instance role,
   Elastic IP, encryption and backups; configure billing alarms. Keep RDS/Redis
   off the public internet. Inspect remote state before any subsequent apply.
3. Provision production R2 storage and scoped credentials, three JSON secret
   objects, production authentication/billing/email integrations, and isolated
   SigNoz ingestion credentials. Never reuse staging payment or auth secrets.
4. Adapt the runtime for external RDS and Redis with TLS verification. Preserve
   private Typesense and Traefik ingress. Import secrets through the instance role
   without printing them and mount only the needed fields per service.
5. Implement a production-specific migration-first release entry point. Exclude
   demo/staging seeds, require live payment configuration, acquire a release lock,
   stop writers during migrations and keep traffic closed on failure. Do not run
   `infra/staging/scripts/deploy.sh` against production unchanged.
6. Gate deployment to main-built images. Verify migrations, all health endpoints,
   login, uploads, queue processing, search and webhooks, then record the deployed
   version. Rollback application images explicitly; never reverse SQL implicitly.
7. Validate restore and disk headroom with actual images before DNS cutover.
   Staging's retained rollback images can consume significant space on 50 GiB.

The workflow changes do not create AWS resources or switch live DNS. Infrastructure
is applied separately through the reviewed Terraform procedure. Use the S3 remote
state as the inventory; never apply a review-only local-backend copy.

## Local release-policy check

```sh
node --test infra/production/release-config.test.mjs
```

## First-launch integration gate

Production R2 media and backup buckets have been created with separate scoped
credentials. The owner saved Google OAuth, Resend, MSG91 and media R2 values in
the app secret and backup R2 values in the backup secret. Independent auth and
Typesense administrator keys have also been generated in the app secret.
Saving credentials is not end-to-end integration verification. Google publishing,
MSG91 sender/template checks and media CORS verification remain launch checks.
Razorpay and SigNoz setup are deferred by the owner. Do not fall back to staging
credentials or enable public traffic while required integrations are incomplete.

- Configure live Razorpay keys, the production webhook secret and production
  Professional Plus/Corporate plan IDs. Verify webhook delivery and signatures.
- Configure the production Google OAuth client and authorized callback/origins
  for the real production domain.
- Verify the production email sending domain and sender in Resend, and the
  production WhatsApp sender/template in MSG91.
- Create production R2 media/backup buckets with separate scoped credentials.
  Preserve private media originals and configure the required upload CORS rules.
- Configure the separate production SigNoz ingestion credentials/destination.
- Bootstrap restricted PostgreSQL application and migration credentials; keep
  the RDS-managed administrator secret out of application containers.
- Generate independent application auth and Typesense keys. Store the grouped
  JSON values in Secrets Manager and mount only required fields per service.
- Complete the production runtime/release path, merge the branch-routing changes,
  and verify a production image build before the first deployment and DNS cutover.

The Redis credential created during infrastructure provisioning is only one
field in the app secret. An existing secret container does not mean application
configuration is complete.

## Initial database roles

[`bootstrap-database.py`](../../infra/production/bootstrap-database.py) runs from
MFA-authenticated CloudShell, using an SSM port-forward through the application
host. The RDS-managed administrator password stays in the operator process; the
EC2 role does not gain permission to read that secret. PostgreSQL uses
`verify-full` with the regional RDS CA and actual database hostname, even though
the TCP connection goes through localhost. The script closes the tunnel on exit.

Run `python3 ~/bootstrap-database.py` for the read-only preflight. It checks the
account, private RDS status, verified TLS, empty database and absence of the two
roles. This preflight passed against production on 2026-11-23. The owner then ran
the reviewed apply command. Both role logins and restricted privileges passed
verification over TLS, and the saved database secret matched the generated
configuration. No migrations or seeds were executed.

After review, run `python3 ~/bootstrap-database.py --apply-reviewed`:

- `tickif_app` gets CONNECT, public schema USAGE, and data/sequence privileges
  on future objects created by `tickif_migrator`. It cannot create schemas or
  tables, truncate tables, read the migration schema or assume the migration role.
- `tickif_migrator` gets CONNECT and schema creation privileges for Drizzle and
  trusted extensions, plus CREATE in public. Neither account gets superuser,
  role creation, database creation, replication or RLS bypass privileges.
- The existing `tickif/production/database` JSON object receives `POSTGRES_HOST`,
  `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `MIGRATION_USER` and `MIGRATION_PASSWORD`. Runtime containers must receive only
  application credentials; only the migration job receives migration credentials.
- Passwords are generated and stored before the transactional SQL. On a failed
  transaction with no roles created, rerunning reuses those stored passwords.
  If roles already exist, the script refuses to reset them. Investigate and
  verify manually if the connection fails after commit; do not delete roles or
  rotate credentials merely to rerun this initial-setup script.

No migrations, demo data, public ingress or DNS changes are part of this step.
The disposable PostgreSQL 16 boundary test is
`python infra/production/test-bootstrap-database.py` (Docker required).
