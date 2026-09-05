import type { Job } from 'bullmq';
import { config } from '@repo/config';
import {
  getObject,
  putObject,
  deleteObject,
  buildDerivativeKey,
  ObjectTooLargeError,
} from '@repo/storage';
import type { MediaProcessJob } from '../connection.js';
import { validateImageBytes } from '../media/validate.js';
import { eachDerivative } from '../media/derivatives.js';
import { defaultWatermarkConfig } from '../media/watermark.js';
import { computePhash, findNearestDuplicate } from '../media/phash.js';
import {
  withMediaProcessingLease,
  type ProcessingImage,
  markReady,
  refreshReadyDerivatives,
  markFailed,
  findProjectPhashes,
} from '../media/repository.js';

export type MediaProcessResult =
  | {
      ok: true;
      skipped: 'missing' | 'already-ready' | 'already-failed' | 'not-ready' | 'lost-race';
    }
  | { ok: true; derivatives: number }
  | { ok: false; reason: string };

type StoredDerivative = {
  variant: string;
  format: 'webp' | 'avif';
  key: string;
  width: number;
  height: number;
};

// Revisioned derivative keys make immutable caching safe across watermark updates.
const DERIVATIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Persist a permanent rejection and drop the now-orphaned original. Cleanup is best-effort. */
async function failPermanently(imageId: string, originalKey: string): Promise<void> {
  await markFailed(imageId);
  await deleteObject(originalKey).catch((err) =>
    console.error(`[worker] media ${imageId}: original cleanup failed`, err),
  );
}

async function generateAndStoreDerivatives(
  image: { id: string; projectId: string },
  original: Buffer,
): Promise<StoredDerivative[]> {
  const generated = [];
  for await (const derivative of eachDerivative(original, { watermark: defaultWatermarkConfig })) {
    generated.push(derivative);
  }

  return Promise.all(
    generated.map(async (derivative) => {
      const key = buildDerivativeKey(
        image.projectId,
        image.id,
        `${derivative.variant}-${config.WATERMARK_REVISION}`,
        derivative.format,
      );
      await putObject({
        key,
        body: derivative.buffer,
        contentType: derivative.contentType,
        cacheControl: DERIVATIVE_CACHE_CONTROL,
      });
      return {
        variant: derivative.variant,
        format: derivative.format,
        key,
        width: derivative.width,
        height: derivative.height,
      };
    }),
  );
}

/**
 * Idempotent media pipeline: fetch original → validate → dedup → strip+derive (watermarked)
 * → write derivatives → compare-and-swap status to ready. Permanent failures (oversize,
 * invalid, duplicate) flip to 'failed' and delete the orphan, returning normally (no retry).
 * Transient errors rethrow WITHOUT touching status, so BullMQ retries with backoff and the
 * row is only marked failed once attempts are exhausted (see the worker's failed handler).
 * Deterministic derivative keys make re-runs overwrite rather than orphan (E-112).
 */
async function processMediaWithLease(
  job: Job<MediaProcessJob>,
  image: ProcessingImage,
): Promise<MediaProcessResult> {
  const { imageId } = job.data;
  const isReprocess = job.data.mode === 'reprocess';
  if (image.status === 'ready' && !isReprocess) return { ok: true, skipped: 'already-ready' };
  if (image.status === 'failed') return { ok: true, skipped: 'already-failed' };
  if (image.status === 'processing' && isReprocess) return { ok: true, skipped: 'not-ready' };

  let original: Buffer;
  try {
    original = await getObject(image.originalKey);
  } catch (err) {
    if (err instanceof ObjectTooLargeError) {
      if (isReprocess) return { ok: false, reason: 'too_large' };
      await failPermanently(imageId, image.originalKey);
      return { ok: false, reason: 'too_large' };
    }
    throw err;
  }

  const validation = await validateImageBytes(original, image.contentType);
  if (!validation.ok) {
    if (isReprocess) return { ok: false, reason: validation.reason };
    await failPermanently(imageId, image.originalKey);
    return { ok: false, reason: validation.reason };
  }

  if (isReprocess) {
    const derivatives = await generateAndStoreDerivatives(image, original);
    const storedKeys = new Set(image.derivatives.map((derivative) => derivative.key));
    if (derivatives.every((derivative) => storedKeys.has(derivative.key))) {
      // Same WATERMARK_REVISION ⇒ same keys: uploads overwrote in place, but immutable
      // CDN caches keep serving the old bytes. Bump WATERMARK_REVISION to take effect.
      console.warn(
        `[worker] media ${imageId}: reprocess regenerated the same derivative keys ` +
          `(WATERMARK_REVISION ${config.WATERMARK_REVISION} unchanged); immutable CDN caches ` +
          'will keep serving old content until the revision is bumped',
      );
    }
    const refreshed = await refreshReadyDerivatives(imageId, {
      derivatives,
      width: validation.width,
      height: validation.height,
    });
    if (!refreshed) {
      // Lost the CAS: nothing references the freshly uploaded revisioned objects, so
      // best-effort delete them rather than leaving orphans in R2. Keys already stored
      // on the row (same-revision overwrite) must survive — the live image uses them.
      const orphanKeys = derivatives
        .map((derivative) => derivative.key)
        .filter((key) => !storedKeys.has(key));
      await Promise.all(
        orphanKeys.map((key) =>
          deleteObject(key).catch((error: unknown) =>
            console.error(`[worker] media ${imageId}: orphaned derivative cleanup failed`, error),
          ),
        ),
      );
      return { ok: true, skipped: 'lost-race' };
    }

    const refreshedKeys = new Set(derivatives.map((derivative) => derivative.key));
    const staleKeys = image.derivatives
      .map((derivative) => derivative.key)
      .filter((key) => !refreshedKeys.has(key));
    await Promise.all(
      staleKeys.map((key) =>
        deleteObject(key).catch((error: unknown) =>
          console.error(`[worker] media ${imageId}: stale derivative cleanup failed`, error),
        ),
      ),
    );
    return { ok: true, derivatives: derivatives.length };
  }

  const phash = await computePhash(original);
  const candidates = await findProjectPhashes(image.projectId, imageId);
  const duplicate = findNearestDuplicate(phash, candidates, config.MEDIA_DEDUP_HAMMING_THRESHOLD);
  if (duplicate && config.MEDIA_DEDUP_ACTION === 'reject') {
    await failPermanently(imageId, image.originalKey);
    return { ok: false, reason: 'duplicate' };
  }
  if (duplicate) {
    // 'flag': keep the image for human moderation rather than reject it.
    console.warn(
      `[worker] media ${imageId} flagged as near-duplicate of ${duplicate.imageId} (distance ${duplicate.distance})`,
    );
  }

  // Encoded derivatives are KB-range, so upload them in parallel instead of paying
  // the storage round-trip latency eight times serially.
  const derivatives = await generateAndStoreDerivatives(image, original);

  const flipped = await markReady(imageId, {
    derivatives,
    width: validation.width,
    height: validation.height,
    phash,
    duplicateOfImageId: duplicate?.imageId ?? null,
    duplicateDistance: duplicate?.distance ?? null,
  });
  // Another run already finished this image; its derivatives overwrote ours (idempotent keys).
  if (!flipped) return { ok: true, skipped: 'lost-race' };
  return { ok: true, derivatives: derivatives.length };
}

export async function processMedia(job: Job<MediaProcessJob>): Promise<MediaProcessResult> {
  const result = await withMediaProcessingLease(job.data.imageId, (image) =>
    processMediaWithLease(job, image),
  );
  return result ?? { ok: true, skipped: 'missing' };
}
