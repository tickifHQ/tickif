# AWS production Docker runtime

Single-node Docker Swarm on the provisioned 8 GiB EC2 host. PostgreSQL and Redis
remain in RDS and ElastiCache. These scripts create no new AWS resources.
See the [runbook](../../docs/runbooks/production-deployment.md) and
[ADR 0022](../../docs/adr/0022-production-hosting-and-release-branches.md).

| Service                         | Memory limit | Access                                                          |
| ------------------------------- | ------------ | --------------------------------------------------------------- |
| Web                             | 768 MiB      | No application secrets; private edge network                    |
| API                             | 768 MiB      | App DB role, TLS Redis, private Typesense, provider credentials |
| Worker                          | 2 GiB        | App DB role, TLS Redis, Typesense, delivery/storage credentials |
| Typesense                       | 2 GiB        | Persistent volume; bootstrap key; no published port             |
| Traefik (optional overlay)      | 512 MiB      | Origin certificate/key; read-only socket proxy                  |
| Socket proxy (optional overlay) | 128 MiB      | Read-only discovery; isolated internal network                  |

The private stack publishes no ports. API/web/worker default to zero replicas.
The deployment script starts one of each after migrations and search preparation
pass. Stop-first updates bound peak memory and imply maintenance downtime.
Media concurrency is 1; SigNoz is disabled. Missing Razorpay configuration is
omitted, never replaced with test keys. Public launch still requires the runbook
integration gates, including live billing.

## Prepare on EC2

1. Merge reviewed runtime/CI changes into main through the normal review process.
   CI publishes four `production-<SHA>` images and the `v0.1.<run>` tag. Record
   their registry digests in a copy of `release.example.json`. The deploy script
   checks production and revision image labels, not just the supplied filenames.
2. Install this directory under `/opt/tickif/production` and the reviewed JSON as
   `release.json`. Authenticate Docker to GHCR with read-packages access if the
   images are private. Use an SSM session; inbound SSH is unnecessary.
3. As root, validate first, then run the reviewed import:

   ```bash
   python3 /opt/tickif/production/prepare-runtime.py --release /opt/tickif/production/release.json
   python3 /opt/tickif/production/prepare-runtime.py --release /opt/tickif/production/release.json --apply-reviewed
   ```

The importer checks the production EC2 identity, reads app/database JSON secrets
through the instance role, sends credentials to Docker over stdin, and writes
non-secret object names/settings to mode-0600 `runtime.env`. Credential files are
mounted as UID 1001, mode 0400. The migration password is never mounted into app
services. The migration config also includes auth/media fields because the
existing shared config parser requires those even for Drizzle. Backup credentials
and the RDS administrator password are not imported.

RDS URLs use `sslmode=verify-full` and the mounted CA bundle; Redis uses `rediss://`
with certificate verification. Existing distinct `TYPESENSE_SEARCH_API_KEY` is
used if present. Otherwise a stable HMAC-SHA256 search key is derived from the
bootstrap key with a production-specific context, enabling recovery without
granting EC2 permission to write AWS secrets. The operations job registers it
with only `documents:search` for production project/designer collections, then
tests searches and rejection of admin access. Neither key reaches browser JS.
Bootstrap-key rotation also changes a derived search key; retire old Typesense
keys explicitly after release verification. Keep previous Docker secrets while
rollback releases still reference them.

## Private release

```bash
bash /opt/tickif/production/deploy-private.sh --apply-reviewed
```

This locks releases, checks image labels/digests and disk headroom (10 GiB before
pulling, 5 GiB after), stops ingress/writers, waits for shutdown, starts Typesense, runs Drizzle
migrations with the migration role, bootstraps search without automatic schema
updates, registers the search key, and starts API/web/worker with health checks.
It runs **no seeds** and does not rebuild an existing populated search index.
Reference-data provisioning and search schema migration/rebuild require separate
reviewed procedures. Failures close writers/ingress; SQL is never reversed
implicitly. Restricted job logs are available for diagnosis; credential-bearing
provider errors are not automatically copied into operator output.

Success writes `private-ready-release`, not a public deployment record. Image
and volume pruning are not automatic. Production images containing these scripts
must be built before this command can run; local source alone is insufficient.

## Separate ingress review

`ingress.yml` expects versioned Docker configs from `traefik/static.yml` and
`traefik/dynamic.yml`, plus `ORIGIN_CERT_SECRET` and `ORIGIN_KEY_SECRET` for a
tickif.com certificate/key. A Cloudflare Origin CA certificate is suitable behind
proxied DNS with Full (strict); direct browsers do not trust that certificate.
Before enabling: verify the certificate, Cloudflare DNS/proxy and trusted proxy
settings, Terraform web ingress, restore checks and private smoke tests. Label
the manager `tickif.traefik=true`. Merge the base, optional billing and ingress
files using the same release inputs; keep `TRAEFIK_REPLICAS=0` until reviewed.
Neither script changes ingress, security groups or DNS. The private deployment
automatically includes `billing.yml` only when all five live fields are present.

## Tests

```bash
python3 infra/production/test-runtime.py
python3 infra/production/test-bootstrap-database.py
node --test infra/production/register-search-key.test.mjs
bash -n infra/production/deploy-private.sh
```

Manifest tests use synthetic credentials. Database and search tests use disposable
containers, no shared development services and no AWS credentials.
