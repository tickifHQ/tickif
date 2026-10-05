# Shared server telemetry

`@repo/telemetry/node` initializes one Node OpenTelemetry SDK per process. API,
worker and Next server use the same lifecycle controller even when their workspace
code is bundled into multiple entry points. Importing the package does not start
the SDK. Browser code must never import this package.

```ts
import { initTelemetry, shutdownTelemetry, getTraceContext } from '@repo/telemetry/node';

initTelemetry({ service: 'tickif-api', instrumentation: 'dependencies' });
// Inject getTraceContext into createServerLogger; stdout is the only log exporter.
// On app shutdown, drain connections first and reserve time inside its deadline:
await shutdownTelemetry(3_000);
```

Configuration comes from the lazy `@repo/config/telemetry` boundary. Disabled
telemetry constructs no SDK/exporter and makes no network requests. Enabled traces
and metrics go to `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces` and `/v1/metrics` using
HTTP/protobuf; an endpoint path prefix is retained. Metrics explicitly use
cumulative temporality, preserving PromQL counter and histogram semantics
regardless of ambient exporter temporality preferences. Applications do not
receive SigNoz credentials. OTLP outages do not affect readiness. The trace queue is
bounded (512 spans), export batches are at most 64 spans and export attempts have
two-second timeouts; shutdown returns `false` if flushing exceeds the caller's
budget or fails. After shutdown the controller cannot be restarted in that process.
Generic or signal-specific `OTEL_EXPORTER_OTLP_*HEADERS` inputs are unsupported
and rejected by config validation: SDK exporters merge ambient headers even when
an empty headers object is supplied. Authentication belongs exclusively to the
collector's export pipeline.

`dependencies` instruments outgoing HTTP, undici, pg and ioredis. The API owns its
manual SERVER request span and duration metric. `all` also instruments incoming
HTTP and must not be combined with another inbound owner. `none` is intended for
Next's native framework spans; do not install a second `@vercel/otel` provider.

## ESM startup

Initialize before instrumented dependencies load. Build an app-specific preload
entry and start production Node with the official loader and preload, for example:

```sh
node --experimental-loader=@opentelemetry/instrumentation/hook.mjs --import ./dist/telemetry.js ./dist/server.js
```

In development use `tsx`'s preload support and load the telemetry entry before the
application dependency graph. All external runtime dependencies from this
package must also be direct app dependencies because tsup inlines workspace code
and pnpm uses isolated dependency layouts. The official ESM loader is required
for pg/ioredis ESM patching; HTTP/undici patching alone is not proof of database
coverage. Production-image collector smoke tests must verify an HTTP dependency
span and a pg/ioredis operation before enabling export in a deployed environment.
[OpenTelemetry ESM support](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/esm-support.md)

## Privacy and manual APIs

`trace`, `context`, `metrics`, `propagation`, `ROOT_CONTEXT`, `SpanKind` and
`SpanStatusCode` are re-exported for explicit application instrumentation. Use
static span names, framework route templates and bounded metric dimensions.
`getTraceContext()` returns validated snake-case IDs for logger injection and
reads the active nested span at every call.

The exporter copies spans and allowlists operational attributes. Raw URL/query,
headers, SQL statements/parameters, unknown attributes, links, tracestate,
exception messages/stacks, and status messages are excluded. Automatic span names
are normalized to stable categories because SQL, URLs or phone-bearing job IDs
can otherwise appear in names. Detailed sanitized exceptions belong in logging.
Metric views strip unknown labels and cap series cardinality at 1,000 per
instrument; producers must still use bounded, nonpersonal values for allowed
labels. Infrastructure identity is assigned by the collector, never SDK host/env
resource detectors. Only a validated traceparent is propagated, with no baggage.

## BullMQ

`createBullMQTelemetry(scope)` wraps the compatible `bullmq-otel` adapter for
native BullMQ 5 processing/producer spans and `job.opts.telemetry.metadata`.
Metadata is bounded, malformed legacy values are ignored, and only W3C v00
traceparent survives. Native attrs/options/results/events and exceptions are
filtered before capture as well as at export. Native BullMQ metrics are omitted
because worker code owns those instruments. Use `freshTraceContext` for scheduler
registration/timer-driven dispatch to avoid retaining an old request parent.
The scope names instrumentation; actual service identity comes from SDK resource
configuration. The adapter does not modify job payloads or deduplication IDs.

Run `pnpm --filter @repo/telemetry typecheck`, `lint`, and `test`. Tests use
in-memory exporters and fake runtimes; they perform no network exports. Deployment
trace/log correlation, Next native fetch propagation, image ESM patching and
collector outage behavior require the staging acceptance run described in the
implementation plan.
