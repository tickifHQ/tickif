# Observability

Tickif sends structured application logs, traces and metrics to SigNoz through a
private OpenTelemetry Collector. Browser logs pass through the validated API
relay. Application logs have one export path: stdout → Docker `json-file` →
collector. Application SDKs export traces/metrics only.

## Provisioning and rollout

Current staging supports exactly one Linux Swarm manager. Do not deploy this
topology unchanged on a multi-node cluster: local Docker proxy affinity, host
attribution and single-owner dependency scraping need a separate design.

1. Deploy the application infrastructure with `TELEMETRY_ENABLED=false`.
   `deploy.sh` creates `tickif_telemetry` as an external encrypted overlay and
   verifies existing network properties. The collector also joins the private
   backend and edge overlays for service probes; no collection port is published.
2. Provision a dedicated persistent filesystem **<=1 GiB** mounted at
   `TELEMETRY_STORAGE_PATH` (default `/var/lib/docker/tickif-telemetry`). Preserve
   it across app/collector releases. Use an operator-managed bounded filesystem,
   not an unlimited directory on the shared Docker data disk. Verify mount
   persistence and free space. The collector stores file offsets and up to
   128 MiB of serialized queued data per signal plus database overhead; the
   filesystem bound protects application storage even if compaction grows it.
   Storage and host/container log mounts grant sensitive read access to the
   collector; restrict operator access and keep the pinned image hardened.
3. Copy the non-secret SigNoz variables from `infra/staging/.env.example` to the
   protected host env file. Select the actual Cloud ingestion region. Create the
   versioned external Swarm ingestion secret through an interactive prompt:

   ```bash
   read -rsp 'SigNoz ingestion key: ' ingestion_key; echo
   printf '%s' "$ingestion_key" | docker secret create tickif_staging_signoz_ingestion_key_v1 -
   unset ingestion_key
   ```

   The value exists only in the mounted collector secret. Apps, browser bundles,
   images, stack configs and Terraform never receive it. Collector file-provider
   loading is verified against the pinned image; arbitrary `_FILE` variables are
   not presumed to work. Management API tokens are separate credentials.

4. Run `bash infra/staging/scripts/deploy-observability.sh /opt/tickif/staging.env`
   from the reviewed release. It checks single-node topology, HTTPS origin,
   secret existence and bounded storage; validates config with a synthetic key;
   creates content-addressed Swarm configs; deploys `tickif-observability` without
   stopping applications. Keep prior configs/secrets for rollback.
5. Inspect `docker stack ps tickif-observability --no-trunc` and collector logs.
   Check private `/` health on collector port 13133 from an internal probe, and
   verify logs, infrastructure metrics and trace ingestion in SigNoz. Health is
   process/pipeline liveness, not a guarantee the remote exporter is succeeding.
6. Enable `TELEMETRY_ENABLED=true` and redeploy applications. Browser build-time
   telemetry opt-in and API `TELEMETRY_BROWSER_INGEST_ENABLED` must both be enabled
   for browser reporting. Keep trace sampling conservative (`0.1` initially).
   Set the build release and runtime `APP_VERSION` consistently. Enable
   `TELEMETRY_QUEUE_METRICS_ENABLED=true` only on the one designated worker;
   deployment rejects this flag with desired worker replicas other than one.
7. Validate/apply [versioned SigNoz definitions](../../infra/observability/signoz/README.md)
   using the separate management credential. Rules are disabled and destinations
   empty initially. Confirm workspace compatibility, query values/units, dashboard
   rendering, environment filters and existing channel names before enabling.

The independent observability stack survives app migration/restore maintenance
and app `--prune`. Image retention excludes these infrastructure images. The
script reports deployed specification, not successful end-to-end ingestion.

## Collection and privacy

App/Traefik containers declare `tickif.telemetry.service`; the logging driver
copies that allowlisted label into each Docker envelope. Only explicitly marked
versioned app JSON records and allowlisted Traefik access records are forwarded.
Unrecognized third-party JSON is dropped. Unstructured dependency and unexpected runtime
output stays local until a sanitizer exists. Docker log rotation remains
10 MiB × five files per app container. Start-at-end avoids a first-install
historical backlog; persisted offsets resume subsequent restarts.

App JSON maps severity (including Pino 60 → OTel FATAL/21), its ISO application
timestamp and trace/span IDs into OTel fields and service/version
into resource attributes. Validated browser relay records retain their API
container/host context while their resource service becomes `tickif-browser`.
Bounded client release is used only on browser log resources, never metric labels.
Traefik access logs drop paths, Referer, client addresses and headers at source;
the collector applies a second explicit safe-field allowlist, including when it
encounters an older Traefik record.

The collector uses Swarm node identity for local infrastructure. It never stamps
its own container identity onto incoming app traces/metrics. Host/container/probe
metrics collect every 30–60 seconds; process metrics and query samples are absent.
Keep request/job/user IDs out of metric labels. Telemetry outages do not fail app
readiness or stop writers. Export retries expire after ten minutes; full queues,
rotated logs or storage failures may lose telemetry. Delivery is not exactly once.

The dedicated HAProxy permits GET ping/version/info/container list/inspect/stats,
plus HEAD ping for Docker API negotiation. It rejects all writes, log/archive/exec
and Swarm/secrets administration. Container inspect is sensitive because it
includes environment metadata; collectors do not promote env values and app
credentials use mounted files. A read-only socket mount alone does not restrict
API methods. Traefik's existing socket proxy policy is unchanged.

## Dashboards and alerts

The dashboard covers filesystem bytes/inodes, container memory, private health,
collector queue, API requests/p95, worker terminal failures and singleton queue
snapshots. Rules include storage floors (root 2 GiB, Docker/containerd 10 GiB,
100,000 free inodes), container memory >85%, failed health probes, API errors >5%
with 100-request/5-error guards, p95 >1 second with a traffic guard, retry
exhaustion, waiting backlog >100, queue head creation age >300 seconds, collector
queue >80%, failed enqueue and missing host telemetry.

Use the configured evaluation windows and tune after staging measurements.
Head creation age includes time before retries and is not an exact wait-time SLA.
Deduplicate mount alerts when Docker/containerd share a backing device. Verify
the required mount is actually present: a missing bind mount can make telemetry
report root storage instead. Missing metrics are not zero; investigate absent
panels. The host missing signal is periodic even during idle app traffic.

Before a migration-first release or restore, set a finite SigNoz planned
maintenance window scoped to app/probe rules, for example 30 minutes. Verify
it expires and extend explicitly if required. Leave disk/host/collector rules
active. Deployment scripts do not create an unverified indefinite mute. A failed
release remaining closed must become visible when maintenance expires.

## Dependency and operational prerequisites

API/worker probes and Typesense `/health` run privately. API readiness checks
Postgres; worker readiness covers Redis. This does not supply full PostgreSQL or
Redis server metrics. For those, provision separate monitoring roles/ACL users
and secrets before adding native receivers; never reuse application administrator
credentials. Typesense JSON `/metrics.json`/`/stats.json` needs a scoped key and
tested adapter before metrics export; it is not a Prometheus endpoint.

An external HTTPS probe is required to observe whole-VM/ingress failure
independently; a probe on the same VM cannot prove external availability.
Backups remain externally scheduled. Before enabling backup-freshness alerts,
confirm the schedule and add a durable success signal; ephemeral completed-job
logs are insufficient. Docker/systemd daemon logs and retention timer failures
require a separately reviewed journal receiver/agent; they are not collected by
the container JSON receiver.

## Verification and rollback

Local/CI checks: `bash infra/staging/scripts/test-observability.sh`,
`bash infra/staging/scripts/test-observability-preflight.sh`, shell syntax checks,
and Terraform `init -backend=false`, `fmt -check`, `validate`. Tests use synthetic
credentials and isolated containers, validate the pinned collector/HAProxy,
exercise proxy denials, parser/trace/severity/browser attribution, Traefik safe
fields, inner app timestamp precedence over Docker flush time, fatal severity,
ignored unmarked/unstructured output and persisted restart offsets.

Staging acceptance still requires a uniquely identified app log and correlated
trace, all service/environment/release identities, real Swarm label metadata,
log rotation, collector/export outage and bounded storage behavior, queue exporter
ownership, shutdown flush deadlines, metric query evaluation and actual alert
firing/resolution. Confirm no secrets in browser assets/images/exported logs.
Whole-host outage and real contact-channel delivery need operator smoke tests.

For rollback, restore the prior collector image/config via its separate stack
deployment or service rollback; preserve persistent offset/queue storage. Disable
app telemetry if needed while stdout logging continues. Do not remove storage
or roll back app schemas to resolve a telemetry failure.

API and worker shutdown use bounded SDK flushes inside their existing drain
deadlines. The Next.js standalone server can call `process.exit()` on SIGTERM;
final in-flight Next.js spans are best effort and cannot be promised to flush.
A custom server lifecycle is follow-up work if that guarantee is required.

For ingestion-key rotation, create a `_v2` secret, update only
`SIGNOZ_INGESTION_KEY_SECRET`, redeploy observability, verify export/recovery,
then retire `_v1`. Retain the old provider key until verification succeeds. Never
echo the key, include it in command arguments, or render it into a Swarm config.

Sources: [SigNoz Swarm collection](https://signoz.io/docs/opentelemetry-collection-agents/docker-swarm/install/),
[Docker log collection](https://signoz.io/docs/userguide/collect_docker_logs/),
[Collector configuration](https://opentelemetry.io/docs/collector/configuration/),
[Collector resiliency](https://opentelemetry.io/docs/collector/resiliency/).
