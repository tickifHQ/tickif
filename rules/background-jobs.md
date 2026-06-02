# Background Jobs (BullMQ worker)

Scope: `apps/worker/**`.

- **Make jobs idempotent** — assume at-least-once delivery; key off a stable
  `jobId` or guard on existing state. BullMQ does not dedupe for you.
- Configure **retries with exponential backoff** and `removeOnComplete` /
  `removeOnFail` (bounded) to cap Redis growth.
- Set explicit concurrency (start ~`floor(cpuCount/2)`, then measure).
- **Pass connection *options*, not a shared ioredis instance**
  (`apps/worker/src/connection.ts`) — avoids the ioredis dual-version type clash.
- Keep payloads small: enqueue **IDs / storage keys**, not blobs; the worker
  re-fetches.
- Always handle SIGINT/SIGTERM with `worker.close()` for graceful shutdown.

## Don't

- ❌ Assume a job runs exactly once.
- ❌ Store large payloads in a job.
- ❌ Hand a constructed `ioredis` instance to BullMQ.
