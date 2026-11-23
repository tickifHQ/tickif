# ADR 0022 - AWS production hosting and release branches

Status: Accepted
Date: 2026-11-23
Supersedes: None
Superseded by: None

## Context

Production planning originally considered autoscaled ECS applications with
PlanetScale and managed Redis. The owner approved a lower-cost initial deployment
for approximately 100 users: a single AWS VM, RDS PostgreSQL and ElastiCache.
Staging currently uses Docker Swarm and Traefik, and previously deployed main.

## Decision

- Mumbai (`ap-south-1`), one x86 EC2 `t3a.large` with 8 GiB RAM and 50 GiB total
  encrypted gp3 storage. Web, API, worker, Typesense and Traefik share the VM.
- RDS PostgreSQL `db.t4g.micro`, Single-AZ, 20 GiB gp3, private networking,
  automated backups and deletion protection. PostgreSQL alone uses its 1 GiB RAM.
- Private ElastiCache Redis OSS `cache.t4g.micro`, supported engine version,
  cluster mode disabled, TLS, authentication and noeviction. Single-node recovery
  needs acceptance testing; no automatic failover is promised.
- One Elastic IP with Cloudflare DNS/CDN for tickif.com. Next.js remains on EC2.
- Production R2 media and backup buckets and separately scoped credentials.
  Originals remain private. Production SigNoz destination and ingestion key are
  separate; zero SigNoz cost is an owner assumption subject to provider limits.
- Group credentials in three Secrets Manager JSON objects by access and rotation
  boundary. Database master rotation may require an additional object. Fetch via
  the EC2 role and distribute only required fields into container secret files.
- `staging` builds staging images and drives staging deployment. `main` builds
  production images with production public URLs. Image tags use bare SHA for
  staging and `production-<SHA>` for production to avoid cross-environment reuse.
- Production build versions use `v0.1.<CI run number>`. A Git tag is recorded
  after all four images publish. Retries retain the version. A release tag records
  a built artifact; a successful production deployment must record that version
  separately after migrations, readiness and smoke checks succeed.

## Consequences

This deliberately replaces the original autoscaling plan with host resizing and
manual capacity management. App host, search and single-node data services have
downtime exposure. Database backup/restore, search recovery, image-processing
memory, TLS connections, CPU credits and deployment disk headroom require tests.

Branch routing and versioned production image preparation are implemented first.
Production runtime remains to be completed: staging deployment
scripts assume local Postgres/Redis, staging seeds and test payment credentials,
and must not be pointed at production as-is. Provisioning requires an AWS session
with MFA. Access was verified after MFA reauthentication; the Mumbai EC2 dashboard
showed no existing instances or Elastic IPs during the initial inventory.

## Amendments

2026-11-23: Production infrastructure is described in Terraform under
`infra/production/terraform`. State uses encrypted, versioned S3 with lockfiles;
GitHub Actions remains responsible for application releases. Secret JSON values
stay outside Terraform; Redis uses an ephemeral input and the provider's
write-only AUTH argument. The configuration provisions three runtime secret
containers and a separate RDS-managed administrator secret (four billable
secrets). Initial web ingress stays closed pending TLS/origin configuration.
EC2 uses standard CPU credits to cap surplus-credit costs; sustained throughput
must be load-tested for throttling. Local validation does not imply provisioning.

2026-11-23 provisioning record: the approved infrastructure was applied in Mumbai
and all 32 Terraform-managed resources were verified with a zero-change plan.
The protected S3 state bucket is bootstrapped separately. Docker/Swarm bootstrap,
RDS certificate/hostname validation and Redis TLS/AUTH/PING checks passed from
the application host. Public application ingress remains closed; no application
release or DNS cutover has occurred. Production integrations still need setup.

2026-11-23 runtime preparation: production now has its own private Swarm stack
and migration-first release script, with no staging/demo seed command. Public
ingress is a separate overlay gated on origin TLS and integration review. The
owner deferred Razorpay and SigNoz; private preparation can omit these, while
public launch remains gated. The secret importer uses the existing EC2 read
permission and creates versioned Docker secrets, never AWS secret writes. A
missing Typesense query key is reproducibly derived with HMAC-SHA256 and a
production-specific context, then registered with a search-only collection ACL.
The database and Docker runtime changes do not imply a public release or DNS
cutover. Main-built image availability and final rollout checks remain required.
