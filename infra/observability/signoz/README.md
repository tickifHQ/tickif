# SigNoz definitions

Official `SigNoz/signoz` Terraform provider **0.1.4**, typed `signoz_rule`
schema **v2alpha1** (requires SigNoz **>=0.133.0**), dashboard schema **v6**.
Provider schema validation passes locally; actual workspace query evaluation
and dashboard rendering still require staging acceptance.

Run `terraform init -backend=false`, `terraform fmt -check` and `terraform validate`
in this directory. CI does not connect to a workspace or apply definitions.
Provider checksums are committed in `.terraform.lock.hcl`.

For operator provisioning, set `SIGNOZ_ENDPOINT` to the workspace UI/API origin
and `SIGNOZ_ACCESS_TOKEN` to a separately scoped management credential. Neither
is the ingestion key. Use a reviewed encrypted backend for state. Preview with
`terraform plan`, review the workspace/version, environment and existing channel
names, then apply explicitly. Never check credentials, state, plan binaries or
populated tfvars into Git.

Alerts are disabled by default (`enable_alerts=false`), notification channels
default empty, and no channels are created. Verify live metric names/units,
including histogram `.bucket` storage names and collector self-metric names,
before enabling. This module assumes cumulative metrics; changing to delta
requires replacing the PromQL queries with supported Query Builder queries.

The API error rule uses unsampled request metrics, 5% errors, at least 100 requests
and 5 server errors over five minutes. Health probes are excluded. The p95 rule
uses a 100-request guard. Worker terminal failures are counters because terminal
jobs may be removed from Redis. Queue gauges use `max`, avoiding accidental
replica sums; exactly one designated worker exporter is required. Queue head age
is age since creation and includes old retry timestamps; it is not the oldest
eligible waiting duration. Collector no-data detection uses periodic host CPU
metrics; idle API traffic is not treated as a monitoring outage.

Initial thresholds and maintenance requirements are in
[the runbook](../../../docs/runbooks/observability.md). Keep app/probe alerts
muted with a finite maintenance window during migration-first releases; leave
disk/host/collector alerts active. Backup freshness alerts require an actual
backup schedule and durable success signal and are not fabricated here.

References: [provider rules](https://registry.terraform.io/providers/SigNoz/signoz/0.1.4/docs/resources/rule),
[metric aggregation](https://signoz.io/docs/metrics-management/types-and-aggregation/),
[PromQL OTel names](https://signoz.io/docs/metrics-management/querying-metrics/).
