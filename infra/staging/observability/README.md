# Tickif collection agent

The supported staging host is a single Linux Swarm manager. This stack has its
own lifecycle and never receives application credentials. Follow
[the observability runbook](../../../docs/runbooks/observability.md) for storage,
network, secret provisioning, validation, rollout and rollback.

The collector and HAProxy images are pinned by version and registry digest.
Use `scripts/deploy-observability.sh` from `infra/staging`'s parent scripts folder;
application `deploy.sh` deliberately does not deploy this stack.

Container log selection is explicit: `tickif.telemetry.service` container labels
are copied by Docker's `json-file` logging option into its `attrs` envelope.
Only marked JSON records are exported. Unstructured dependency output remains
in local Docker logs until a suitable sanitizer is added. Collector and proxy
logs are excluded from file ingestion to prevent feedback loops.
