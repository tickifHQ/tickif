# @repo/logger

Structured logging shared by Node servers and browsers. The root export contains
runtime-neutral types and sanitizers; import a factory from `/server` or `/browser`.
The package does not load configuration, initialize OpenTelemetry, or contain credentials.

```ts
import { createServerLogger, runWithLogContext } from '@repo/logger/server';

const logger = createServerLogger({
  service: 'tickif-api', environment: 'staging', version: 'release-sha',
});
runWithLogContext({ requestId: 'request-id' }, () => {
  logger.info({ event: 'request.completed', durationMs: 12 }, 'Request completed');
});
await logger.flush();
```

Pass typed configuration from the application. Inject `getTraceContext` to read the
active `{ trace_id, span_id, trace_flags? }` on each log call. Request/job context
uses AsyncLocalStorage; services do not need framework imports. Child loggers add
component metadata without changing service/environment/release identity.

Server Pino writes newline-delimited JSON to stdout, the only application log
ingestion path. Do not also configure OTLP log forwarding. Collector processing
must map timestamp/severity/message/resource and trace fields explicitly. Numeric
levels are Pino values (20/30/40/50/60), not OpenTelemetry severity numbers.
The default asynchronous stdout buffer is capped at 1 MiB; writes beyond that
budget are dropped. An asynchronous destination error stops further writes without
throwing into application work. Custom destinations own their buffering policy.

Browser construction takes `send(events: LogRecord[]): Promise<void>`; the app owns
its typed HTTP client and wire-contract mapping. Default minimum level is `warn`.
Queues remain in memory and default to 50 records (hard maximum 100), with batches
of 5 records (hard maximum 10). Records are bounded to 8 KiB UTF-8 each; split
batches to the receiving endpoint's byte budget in the sender. No retries, console
interception, listeners, cookies, URL handling, or storage are installed here.

`flush()` sends one batch and waits at most 3 seconds by default (maximum 10 seconds).
Concurrent flush calls share one send. Sender rejection drops that batch. A stalled
sender disables further export and clears pending records, avoiding an unbounded
number of uncancelable pending requests. Reinitialize the browser logger to resume
after a permanently stalled sender. Delivery during page unload is best effort.

Use static messages and allowlisted domain fields. Never pass raw headers, bodies,
provider responses, environment/config objects, job payloads, search text or SQL.
The shared sanitizer removes private keys, credentials, contact details, full URLs,
and OTP patterns, bounds traversal and string sizes, and normalizes errors/cycles.
It cannot recognize every secret embedded in arbitrary prose; callsites must avoid
constructing sensitive messages. Identifier fields containing contact data must be
hashed at their application boundary. Envelope identity and trace fields are reserved.
Oversized records discard attributes and shorten messages, marking `truncated`.

Logging failures never throw into business operations. Server flush defaults to a
1-second deadline; apps should call it inside their existing shutdown budget.
Development OTP diagnostics must remain outside the exported telemetry path.

Run `pnpm --filter @repo/logger typecheck`, `lint`, and `test`; repository completion
also requires the full workspace checks and relevant production builds.
