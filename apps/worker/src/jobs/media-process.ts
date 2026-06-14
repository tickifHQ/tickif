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
  getImageForProcessing,
  markReady,
  markFailed,
  findProjectPhashes,
} from '../media/repository.js';

export type MediaProcessResult =
  | { ok: true; skipped: 'missing' | 'already-ready' | 'already-failed' | 'lost-race' }
  | { ok: true; derivatives: number }
  | { ok: false; reason: string };

// Derivatives are content-addressed by key (variant never changes), so cache them forever.
const DERIVATIVE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Persist a permanent rejection and drop the now-orphaned original. Cleanup is best-effort. */
async function failPermanently(imageId: string, originalKey: string): Promise<void> {
  await markFailed(imageId);
  await deleteObject(originalKey).catch((err) =>
    console.error(`[worker] media ${imageId}: original cleanup failed`, err),
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
export async function processMedia(job: Job<MediaProcessJob>): Promise<MediaProcessResult> {
  const { imageId } = job.data;
  const image = await getImageForProcessing(imageId);
  if (!image) return { ok: true, skipped: 'missing' };
  if (image.status === 'ready') return { ok: true, skipped: 'already-ready' };
  if (image.status === 'failed') return { ok: true, skipped: 'already-failed' };

  let original: Buffer;
  try {
    original = await getObject(image.originalKey);
  } catch (err) {
    if (err instanceof ObjectTooLargeError) {
      await failPermanently(imageId, image.originalKey);
      return { ok: false, reason: 'too_large' };
    }
    throw err;
  }

  const validation = await validateImageBytes(original, image.contentType);
  if (!validation.ok) {
    await failPermanently(imageId, image.originalKey);
    return { ok: false, reason: validation.reason };
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

  // Encoded derivatives are KB-range, so collect them (the full-res raw is already released)
  // and upload in parallel rather than paying R2 round-trip latency 8 times serially.
  const generated = [];
  for await (const d of eachDerivative(original, { watermark: defaultWatermarkConfig })) {
    generated.push(d);
  }
  const derivatives = await Promise.all(
    generated.map(async (d) => {
      const key = buildDerivativeKey(image.projectId, imageId, d.variant, d.format);
      await putObject({
        key,
        body: d.buffer,
        contentType: d.contentType,
        cacheControl: DERIVATIVE_CACHE_CONTROL,
      });
      return { variant: d.variant, format: d.format, key, width: d.width, height: d.height };
    }),
  );

  const flipped = await markReady(imageId, {
    derivatives,
    width: validation.width,
    height: validation.height,
    phash,
  });
  // Another run already finished this image; its derivatives overwrote ours (idempotent keys).
  if (!flipped) return { ok: true, skipped: 'lost-race' };
  return { ok: true, derivatives: derivatives.length };
}
