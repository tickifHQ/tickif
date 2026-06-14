# Runbook — Media pipeline

Operational guide for the image pipeline: queue `media`, worker `apps/worker`,
storage `@repo/storage` (R2). Background: [ADR 0002](../adr/0002-media-pipeline.md).

## Mental model

`upload-url` → client PUT to R2 → `commit` enqueues `media-{imageId}` → worker
downloads, validates, dedups (pHash), strips EXIF + derives watermarked webp/avif,
writes derivatives, compare-and-swaps `project_image.status` to `ready`.

Every step is **idempotent**: jobId is `media-{imageId}`, derivative keys are
deterministic (`derivatives/{projectId}/{imageId}/{variant}.{format}`), and the
status flip is a CAS. **Re-enqueuing the same image is always safe.**

## Inspecting failed jobs

A row ends up `status = 'failed'` for one of two reasons:

- **Permanent** — oversize, invalid/undecodable, or a rejected duplicate
  (`MEDIA_DEDUP_ACTION=reject`). The worker logged the reason
  (`media <imageId>: ... reason ...`) and **deleted the original** from R2. Returns
  normally; no retry.
- **Transient, exhausted** — an R2/I/O error that retried `attempts: 3` (exponential
  backoff) and then the worker's `failed` handler marked the row failed.

Find the state:

```sql
SELECT id, status, content_type, original_key, jsonb_array_length(derivatives) AS derivs
FROM project_image WHERE id = '<imageId>';
```

Failed jobs are retained in BullMQ for 7 days (`removeOnFail: { age: 604800, count: 5000 }`),
so the failure + stack is still inspectable in the `media` failed set. Worker logs
key everything on `media <imageId>`.

## Replaying / re-enqueuing a job

Re-enqueue is **idempotent** — a deterministic re-run overwrites its own derivative
keys and the CAS protects against a concurrent finisher. To reprocess an image:

1. Confirm the original still exists. A **permanently** failed image's original was
   deleted; you must re-upload it (mint → PUT → commit) — there is nothing to replay.
2. If the original exists (transient failure), reset the row and re-enqueue:
   ```sql
   UPDATE project_image SET status = 'processing' WHERE id = '<imageId>' AND status = 'failed';
   ```
   Then enqueue `media-{imageId}` on the `media` queue (re-running `commit` does this;
   or add the job directly via a BullMQ admin). The handler short-circuits on
   already-`ready`/`failed` rows, so resetting to `processing` is what makes it run.

> Never delete-and-recreate the row to "retry" — that changes the imageId and orphans
> any derivatives. Reset status + re-enqueue instead.

## Migration 0005 — rollback / forward-fix

0005 is **one-way** (`room_slug` is dropped, unrecoverable). There is no rollback.

- **Before a populated apply:** `pg_dump -t project_image` for a logical backup.
- **If it half-applied / you need to fix forward:** write a new corrective migration —
  do **not** hand-edit 0005 or attempt a down-migration. The expand/contract steps are
  written to be re-runnable (`WHERE original_key IS NULL` backfill guard), so a re-apply
  on a partially-migrated table is safe for the column adds/backfill.
- **Indexes on a large/persistent table:** drizzle runs each migration in a transaction,
  so the `CREATE INDEX` statements lock the table. Comment them out of the applied
  migration and build them out-of-band:
  ```sql
  CREATE INDEX CONCURRENTLY project_image_project_idx ON project_image (project_id);
  CREATE INDEX CONCURRENTLY project_image_project_sort_idx
    ON project_image (project_id, sort_order, created_at);
  ```
  (0007 swaps the indexes — apply the same CONCURRENTLY treatment there.)

## Orphan-original cleanup

Originals can be orphaned two ways, cleaned two ways:

- **Permanent failure** → the app deletes the original inline (best-effort; a failed
  delete is logged, not retried). If you see leftover `originals/` objects whose row is
  `failed`, the inline delete failed — delete them manually:
  ```bash
  mc rm local/tickif-media/originals/<projectId>/<uuid>     # or aws s3 rm against R2
  ```
- **Abandoned uploads** (URL minted, never committed) → swept by the **R2 lifecycle
  rule** on the `originals/` prefix (infra/r2). If abandoned objects are piling up,
  check that the lifecycle rule is present and its expiry window is sane.

To audit orphans: list `originals/` and diff against `project_image.original_key`
where `status != 'failed'`.

## Worker memory sizing

Peak worker memory is driven by concurrent decodes. Budget roughly:

```
peak ≈ MEDIA_WORKER_CONCURRENCY × MEDIA_MAX_IMAGE_PIXELS × 4 bytes
```

(4 bytes/pixel for decoded RGBA raw; the pipeline decodes the original **once** to raw
and resizes variants from that, so the full-res raw dominates.) At the defaults
(concurrency 4, 40 MP) that's ~640 MB of raw pixels plus libvips/Node overhead — size
the container with headroom. `sharp.concurrency(1)` + `sharp.cache(false)` keep
per-job memory bounded so BullMQ `concurrency` is the only multiplier. If the worker
OOMs, lower `MEDIA_WORKER_CONCURRENCY` first, then `MEDIA_MAX_IMAGE_PIXELS`.

## DLQ / failed-set retention

There is no separate dead-letter queue — BullMQ keeps failed jobs in the `media`
failed set for **7 days** (`removeOnFail: { age: 604800, count: 5000 }`, `@repo/queue`).
Completed jobs are removed immediately (`removeOnComplete: true`). A failure spike is
capped at 5000 retained jobs; if you need older evidence, pull it before the age
window expires. The source of truth for terminal state is the `project_image.status`
column — the failed set is for the error/stack detail.

## Health & graceful shutdown

The worker serves `/livez` (process up) and `/readyz` (200, flips to 503 while
draining) on `WORKER_HEALTH_PORT` (default 3002). On SIGTERM it stops accepting jobs,
finishes in-flight work, closes the queues, then exits — wire `readyz` into your
orchestrator so it stops routing before the drain.
