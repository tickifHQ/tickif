# Observability architecture

Shared logging, application telemetry, browser error ingestion, and staging observability configuration are implemented in the workspace. This document describes the resulting design and remaining rollout work. It does not establish that a deployed SigNoz workspace has received data or that live alerts have fired.

Use [the observability runbook](../runbooks/observability.md) for deployment, credential provisioning, smoke checks, alert activation, and rollback. SigNoz Cloud is the default configuration; the operator must choose the actual workspace and region before enabling export.

## Implemented architecture

```text
API / worker / Next.js server
  @repo/logger/server -> JSON stdout -> Docker filelog collector -> SigNoz logs
  @repo/telemetry/node -> private OTLP -> collector -> SigNoz traces + metrics

Browser
  @repo/logger/browser -> typed POST /api/telemetry/logs
                      -> validated API stdout -> collector browser attribution

Host / containers / private dependency health probes
  collector receivers -> SigNoz infrastructure metrics
```

Application logs have one ingestion path: structured stdout. The Node SDK does not forward those same events through an OTLP log exporter. Collector processing maps JSON timestamp, severity, service/environment/release, and trace/span IDs to the OpenTelemetry log envelope. Numeric Pino levels are mapped to OpenTelemetry severity numbers; they are different scales. [SigNoz collection methods](https://signoz.io/docs/logs-management/send-logs/collection-methods/)

Resource identity uses `service.name`, `service.version`, and `deployment.environment.name`. Service names are `tickif-api`, `tickif-worker`, `tickif-web`, and `tickif-browser`. Browser events appear on API stdout with server-assigned `telemetrySource` and `sourceService` attributes; the collector promotes that trusted source marker to browser service identity. A bounded browser release identifier remains untrusted metadata and retains an old tab's release. Development/test identity derives from `NODE_ENV`; deployed staging/production identity derives from `DEPLOYMENT_ENV`.

## Shared packages

`@repo/logger` exports runtime-neutral types and sanitizers. Explicit `/server` and `/browser` entry points keep Pino, AsyncLocalStorage, and Node imports out of browser bundles. Configuration and active trace lookup are injected; imports do not read environment variables or initialize an SDK.

The common interface has synchronous `debug`, `info`, `warn`, `error`, `fatal`, `child`, `isLevelEnabled`, and asynchronous `flush`. Envelope identity is reserved, attributes are bounded, and active trace/span lookup occurs per log call. Context wrappers isolate concurrent requests and job attempts without framework imports in domain services.

| Boundary             | Implemented limit and behavior                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Encoded event        | 8 KiB UTF-8; oversized attributes are discarded and marked `truncated`                                                    |
| Normalization        | Depth four, 40 fields, 20 array entries, 200 visited values                                                               |
| Strings              | 2,048 characters ordinarily; error stack normalization initially allows 4,096 and subsequent normalization may shorten it |
| Server stdout buffer | 1 MiB; excess writes drop rather than growing indefinitely                                                                |
| Server flush         | One-second default deadline                                                                                               |
| Browser queue        | 50 records by default, maximum 100; oldest pending record drops when full                                                 |
| Browser batch        | Five records by default, maximum ten; web transport splits to its byte budget                                             |
| Browser flush        | One batch per call, three-second default deadline, no retries                                                             |

A rejected browser send drops its batch. A permanently stalled sender disables further export and clears pending records, avoiding accumulated uncancelable requests. Unload delivery remains best effort. Server asynchronous sink errors stop further writes without failing business operations. See [the logger README](../../packages/logger/README.md) for the exact API and limits.

The sanitizer removes sensitive keys, credentials, contact information, full URLs, OTP patterns, raw queries/payloads, and unsafe error metadata. Valid complete RFC UUID correlation values are preserved. Free-text scrubbing cannot identify every possible secret: callsites must use static messages and allowlisted fields. Sensitive job IDs are hashed before logging. Operational events do not replace a transactional audit store; development OTP diagnostics remain outside exported telemetry.

`@repo/telemetry/node` explicitly initializes one SDK per process and provides bounded shutdown, active context, manual instrumentation, and BullMQ integration. Importing it does not initialize anything. Disabled export creates no SDK or network requests. Enabled traces/metrics use HTTP/protobuf and cumulative metric temporality. Export privacy filters remove raw URLs, headers, SQL, baggage, unsafe exceptions, and unknown attributes; metric views bound dimensions and cardinality. [The telemetry README](../../packages/telemetry/README.md) records SDK queue sizes, startup requirements, and coverage limitations.

## Application integration

The API owns its SERVER request span and request duration/count metrics. Middleware generates a server-owned UUID, returns `X-Request-Id`, establishes context before session handling, and records route template, method, status and duration. Unexpected errors get one structured error event; existing response envelopes and expected-error behavior are preserved. Routine successful probes and browser ingestion are excluded from ordinary request telemetry.

API/worker startup initializes telemetry before instrumented dependencies. Built ESM startup uses the official OpenTelemetry hook and separate preload entry; tsup bundles workspace source while apps declare external runtime dependencies directly. Built-image HTTP/pg/Redis patching must still be proved against the deployed runtime rather than inferred from SDK boot. [OpenTelemetry ESM support](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md)

BullMQ native telemetry carries validated W3C traceparent through `job.opts.telemetry.metadata` without changing payloads or deterministic job IDs. Legacy/malformed metadata is tolerated, baggage is discarded, and recurring work starts fresh traces. Worker context and events distinguish attempts, completion, retryable failure, and terminal transition. Redis-global queue gauges are enabled on one designated worker per environment to avoid duplicate counts. Queue head creation age is not the oldest runnable job age; dashboards retain that distinction.

Next server registration and request-error hooks use shared telemetry and logging. Root/nested browser error boundaries, unhandled exceptions/rejections, and handled server page failures use shared reporters. Browser listeners initialize before hydration and deduplicate repeated boundary/global reporting.

`apps/web/src/env.instrumentation.ts` is the narrow centralized framework environment boundary. Its literal `process.env.NEXT_RUNTIME === 'nodejs'` checks allow Next/Turbopack to prune Node-only imports from Edge graphs; replacing them with an imported typed boolean failed the production build. Application settings remain validated through config, and browser code never imports this file. Internal source-package imports use extensionless paths so Turbopack resolves workspace TypeScript correctly. [Next instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation)

The anonymous browser relay uses contracts-backed input, origin/content-type/body validation, bounded batches and process-local rate budgets. It skips session resolution so auth/database outages do not block reporting. The typed Hono browser transport omits credentials, uses best-effort keepalive, splits batches to 24 KiB, and applies a two-second total send deadline. The endpoint caps bodies at 32 KiB. There is no localStorage queue, blanket console interception, or recursive reporting of transport errors.

## Environment and credential boundaries

Typed server configuration is exposed through lazy `@repo/config/telemetry`; Next can load it without API/auth secrets. Root/staging env templates, Turbo propagation, image build inputs, CI, and deployment wiring contain telemetry settings. Templates contain placeholders and secret object names, not ingestion credentials.

| Variable                            | Use                                                |
| ----------------------------------- | -------------------------------------------------- |
| `LOG_LEVEL`                         | Server minimum severity; default `info`            |
| `TELEMETRY_ENABLED`                 | Server trace/metric export opt-in; default `false` |
| `OTEL_SERVICE_NAME`                 | Optional known service override                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT`       | Private collector HTTP base, required when enabled |
| `OTEL_TRACES_SAMPLER_ARG`           | Sampling ratio zero to one; default `0.1`          |
| `APP_VERSION`                       | Server release metadata                            |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`     | Browser capture opt-in embedded at build time      |
| `NEXT_PUBLIC_APP_VERSION`           | Browser release embedded at build time             |
| `TELEMETRY_BROWSER_INGEST_ENABLED`  | Independent API runtime relay kill switch          |
| `TELEMETRY_BROWSER_ALLOWED_ORIGINS` | Optional explicit origin allowlist                 |
| `TELEMETRY_QUEUE_METRICS_ENABLED`   | Redis-global gauges on one designated worker       |
| `SIGNOZ_OTLP_ENDPOINT`              | Collector's regional SigNoz destination            |
| `SIGNOZ_INGESTION_KEY_SECRET`       | Versioned external Swarm ingestion-secret name     |
| `TELEMETRY_STORAGE_PATH`            | Operator-provisioned bounded collector storage     |

Generic or signal-specific `OTEL_EXPORTER_OTLP_*HEADERS` are rejected on enabled applications: SDK exporters can merge ambient headers even when explicit headers are empty. Only the collector receives ingestion credentials. Management provisioning uses a separate `SIGNOZ_ACCESS_TOKEN` and workspace endpoint. Neither credential belongs in application images, public config, or Turbo inputs. [SigNoz key types](https://signoz.io/docs/ingestion/signoz-cloud/keys/)

`NEXT_PUBLIC_*` settings are embedded in image builds. Changing runtime stack env does not change an existing browser bundle. Runtime ingress disable stops acceptance immediately; disabling capture in already-open tabs requires refreshed clients with a rebuilt image or a future runtime public-config mechanism.

## Infrastructure, dashboards and alerts

The separate staging observability stack survives application scale-to-zero and `--prune` releases. A private encrypted overlay connects API, worker, web and collector through `otel-collector:4318`. OTLP/admin endpoints are not published publicly. Deployment remains single-node Swarm; multi-node HA is outside this change.

Configuration includes Docker JSON log collection, explicit application/browser mapping, host/container metrics, private health probes, collector metrics, persistent checkpoints, and bounded export queues. A separate Docker API proxy restricts methods/endpoints needed by collection rather than broadening Traefik's proxy policy. Traefik metrics/access-log privacy configuration is included. Operator-provisioned storage must have a verified capacity bound; queue item counts alone do not guarantee a disk-byte quota.

Versioned Terraform dashboard/alert definitions live in `infra/observability/signoz`. Activation defaults to disabled. Operator review must verify SigNoz edition/version compatibility, live metric names/units, baseline thresholds, and existing notification channel names before applying or enabling them. No live provisioning or notification is implied by local Terraform validation. [SigNoz Terraform alerts](https://signoz.io/docs/alerts-management/terraform-provider-signoz/)

## Remaining operator rollout

1. Choose Cloud/self-hosted, actual region/workspace, retention, ingestion budget, and staging/production credential policy.
2. Provision the versioned ingestion secret and bounded persistent collector storage; confirm private networking and source host identity.
3. Deploy observability independently, validate pinned collector/proxy config, then enable a small staging application sample.
4. Verify a unique event, service/environment/release attribution, browser promotion, HTTP/dependency/queue/Next traces, and log-to-trace correlation in the actual workspace. Check rotation and collector restart/outage behavior while application readiness stays healthy.
5. Review Terraform plans with a separate management credential. Verify live alert queries, arrange reviewed channel names and bounded maintenance suppression, then test controlled firing and recovery.
6. Baseline costs/traffic, tune sampling/thresholds, and roll out production with conservative export settings and a rollback path.

The runbook contains commands and deployment checks. Local package tests and production builds establish implementation behavior; they do not replace live acceptance. Required repository checks remain `pnpm typecheck`, `pnpm lint`, `pnpm test`, relevant production builds, and browser/infra smoke tests. Record actual results and outstanding limitations in the change report.

## Deferred coverage

- Full browser RUM, Web Vitals/performance tracing, private source-map upload and symbolication. Public production source maps stay disabled.
- Persistence of the original API trace through database outboxes. Direct queue propagation is implemented; later dispatch correlates with its dispatch trace. Original-context persistence requires a reviewed schema migration.
- PostgreSQL statistics and Redis privileged metric receivers with actual monitoring roles/ACL users. API readiness covers Postgres and worker readiness covers Redis; these checks do not provide full server metrics. Provisioning a secret would not create the required permissions.
- A Typesense JSON-statistics adapter, multi-node collector affinity/duplicate scraping, external whole-VM probes, and backup freshness alerts once the actual backup schedule is confirmed.
- Tail sampling to retain every error trace. Logs export independently of trace sampling, but unsampled traces cannot be opened from their logs.
- Docker/systemd daemon journal logs and retention-timer failures require a reviewed journal collector; unmarked or unstructured runtime/container output stays local.
- A custom Next server lifecycle if guaranteed final-span flush is required. Standalone Next can exit on SIGTERM; its final in-flight span delivery remains best effort.

Rollback disables SDK export/browser ingestion or restores prior immutable app images and collector config. Keep structured stdout, business jobs, checkpoints, retained evidence, and previous compatible secret/config versions available during recovery.

## Local verification — 5 October 2026

- Workspace `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass. After incorporating main's dependency and runtime updates, the full test run passed 4,327 tests; four credential-dependent Razorpay connectivity tests were skipped.
- API, worker, and Next.js production builds pass. API and worker compiled telemetry smoke tests pass inside the pinned Node 22 Docker build images. Next standalone startup, unavailable-collector resilience, and actual trace export to a local OTLP receiver pass.
- Frozen-lockfile installation, shell syntax, deployment preflight checks, pinned collector/proxy validation, log privacy/severity/timestamp mapping, and checkpoint restart regression checks pass. The official SigNoz Terraform provider schema and formatting validate; live workspace queries and alert delivery remain operator acceptance work.
- The test host's WSL kernel lacks `/proc/self/io`, triggering a [Typesense startup defect](https://github.com/typesense/typesense/issues/2998). Tests used a separate disposable Typesense 30.2 instance from an existing local compatibility image. Deployment images were unchanged, and the disposable database, Redis, and search containers were removed after validation.
- After incorporating main's dependency updates and removal of unused `shadcn` tooling, `pnpm audit --audit-level=high` passes (one moderate advisory remains below the high-severity gate).
