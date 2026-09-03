# ADR 0002 — Media pipeline (presign → commit → queue → derive)

Status: Accepted
Date: 2026-06-14
Context: E-107/108/109/110/111/112 (Epic 7 · Media)

## Context

Designers upload project photos that must be served fast, responsive, and watermarked,
with the high-res originals kept private. The work — decode, validate, dedup, strip EXIF,
resize, re-encode to WebP/AVIF, watermark — is CPU-heavy and slow, so it can't run inside
the request. We also can't trust client-declared bytes, and the same image may be
submitted twice (double-click, retry, at-least-once queue redelivery). We need an upload
path that keeps large bytes off the API, processes asynchronously, and is safe to run more
than once.

## Decision

1. **Direct-to-storage upload, brokered by the API.** The client never streams image bytes
   through the API. Instead:
   - `POST /api/media/upload-url` (`projectId`, `contentType`, `size`) creates a
     `processing` `project_image` row and returns a presigned R2 PUT URL.
   - The client PUTs the bytes straight to R2. **Content-type AND content-length are pinned
     into the signature** (`signableHeaders` forces both), so the client can't upload a
     different type or a larger body than was declared at mint.
   - `POST /api/media/{imageId}/commit` confirms the object exists (HEAD) and enqueues the
     processing job. It returns `202` with `status: 'processing'`.
   - The worker downloads, validates, dedups, derives, writes derivatives, then
     compare-and-swaps the row to `ready`.

   Keeping bytes out of the API process means the API stays small and stateless; R2 absorbs
   the upload bandwidth.

2. **Async via BullMQ; the API only enqueues.** `commit` calls `enqueueMedia`; the worker
   (`apps/worker`) consumes the `media` queue. Queue names are the API↔worker contract
   (`@repo/queue`). Image work is CPU-bound, so the worker runs `sharp.concurrency(1)` and
   `sharp.cache(false)` and parallelizes only via BullMQ `concurrency`
   (`MEDIA_WORKER_CONCURRENCY`).

3. **Idempotency contract — safe to run any number of times.** Three independent mechanisms:
   - **jobId dedupe.** The job id is `media-{imageId}` (`@repo/queue`), so at-least-once
     redelivery of the same image collapses to one queued job.
   - **Deterministic derivative keys.** `derivatives/{projectId}/{imageId}/{variant}.{format}`
     never includes a random component, so a re-run **overwrites** its own outputs rather
     than orphaning a previous run's.
   - **Compare-and-swap to `ready`.** `markReady` only flips a row that is still
     `processing`; if a concurrent run already finished (its derivatives overwrote ours via
     the deterministic keys), the swap loses the race and returns without harm
     (`skipped: 'lost-race'`). The handler also short-circuits on already-`ready`/`failed`
     rows up front.

4. **Permanent vs. transient failure model.** The two classes are handled differently on
   purpose:
   - **Permanent** (oversize, invalid/undecodable, rejected duplicate) → the worker flips
     the row to `failed`, **deletes the now-orphaned original from R2**, and returns
     *normally* (no exception), so BullMQ does **not** retry a doomed job.
   - **Transient** (R2 hiccup, transient I/O) → the handler **rethrows without touching
     status**, so BullMQ retries with exponential backoff (`attempts: 3`). The row is only
     marked `failed` once attempts are exhausted, by the worker's `failed` handler — a single
     blip never flaps the status.

5. **Dedup is per-project perceptual hashing.** The worker computes a pHash and compares it
   (Hamming distance ≤ `MEDIA_DEDUP_HAMMING_THRESHOLD`) against the project's existing
   images. `MEDIA_DEDUP_ACTION` selects the response:
   - `reject` → treat as a permanent failure (fail + delete original).
   - `flag` → keep the image, **log a warning only**. There is no moderation queue yet; the
     warning is the entire mechanism today. A real flagged-for-review surface is future work.

6. **Watermark on derivatives only.** The original stored in R2 is never modified — EXIF is
   stripped and the watermark composited only onto the generated public WebP/AVIF variants
   (and only on variants wide enough to be legible, `minImageWidth`). This keeps a clean
   master while every public URL is branded.

7. **Orphan cleanup is split by cause.**
   - **Permanent failure** → the app deletes the original inline (best-effort; a failed
     delete is logged, not retried; a database-aware orphan sweep is the backstop).
   - **Abandoned uploads** (URL minted, bytes never PUT or never committed) → swept only
     after database references are checked. Committed originals use the same prefix, so
     an age-only bucket rule would destroy live or recoverable media.

## Consequences

- The upload is a **three-call dance** (mint → PUT → commit); a client that mints but never
  commits leaves a `processing` row and an orphan original until the database-aware sweep
  removes it. That's accepted: commit is the only signal the bytes actually landed.
- Authorization is **owner OR superadmin** (moderation) for every media use-case, matching
  the canonical `requireOwnership` policy. **Org-member access is deferred** until
  `designer_profile ↔ organization` is modeled (E-66) — there is no designer↔org link yet.
- Because derivative keys are deterministic and the swap is CAS, **replaying a failed or
  stuck job is always safe** — see [the runbook](../runbooks/media-pipeline.md).
- `@repo/storage` requires the `R2_*` env in production (`assertMediaStorageConfig` fails
  the worker fast at boot rather than failing every job later). Locally, point `R2_ENDPOINT`
  at MinIO — see [getting-started.md](../getting-started.md).
- The `flag` dedup action is currently observability-only; shipping a moderation queue is a
  follow-up and will need a new status/surface, not just a config flip.
