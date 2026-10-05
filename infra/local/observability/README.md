# Local SigNoz collector

The optional Compose service accepts telemetry from host `pnpm dev` processes on
`http://127.0.0.1:4318`. It stamps `deployment.environment.name=development` and
`service.namespace=tickif`; staging uses `deployment.environment.name=staging`.
Filter SigNoz by this resource attribute to separate both environments in one
workspace. Each process retains its `service.name` and release version.

Save the verified ingestion credential in the ignored
`.secrets/signoz_ingestion_key` file, without a trailing newline. The collector
alone receives this file at `/run/secrets/signoz_ingestion_key`. Do not put the
credential in `NEXT_PUBLIC_*`, application environment variables, or committed
files. On Linux this Compose bind-mounted secret must be readable by image UID
10001; Compose file-secret permissions come from the host file. A directory with
mode `0700` and secret file mode `0644` keeps other host users from traversing the
directory while allowing the individually mounted file to be read in the container.

Set the verified workspace region in root `.env`:

```dotenv
SIGNOZ_OTLP_ENDPOINT=https://ingest.in2.signoz.cloud:443
NODE_ENV=development
TELEMETRY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
```

Start only the collector, leaving existing dependency services alone:

```bash
docker compose --profile observability up -d --no-deps otel-collector
pnpm dev
```

Stop only the collector with `docker compose stop otel-collector`. Avoid a broad
`docker compose down` for this action because it also removes development
dependencies. If port 4318 is occupied, set `LOCAL_OTLP_HTTP_PORT` and change the
application OTLP endpoint to the same port.

This local collector currently receives application traces and metrics. Logs
remain in the `pnpm dev` terminal; no Docker socket or host log directory is
mounted, and OTLP logs are not enabled. Infrastructure collection and alerts
remain in the staging observability stack. Local sending queues are bounded to
8 MiB per signal in memory and are discarded when the collector stops.

Run `bash infra/local/observability/test-collector.sh` for isolated, synthetic
validation. It neither reads the real credential nor exports data to SigNoz.

Compose references: [profiles](https://docs.docker.com/compose/how-tos/profiles/),
[file secrets](https://docs.docker.com/compose/how-tos/use-secrets/).
