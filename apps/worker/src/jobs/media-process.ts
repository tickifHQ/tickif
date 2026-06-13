import type { Job } from 'bullmq';
import { config } from '@repo/config';
import { getObject, putObject, buildDerivativeKey } from '@repo/storage';
import type { MediaProcessJob } from '../connection.js';
import { validateImageBytes } from '../media/validate.js';
import { generateDerivatives } from '../media/derivatives.js';
import { defaultWatermarkConfig } from '../media/watermark.js';
import { computePhash, findNearestDuplicate } from '../media/phash.js';
import {
  getImageForProcessing,
  markReady,
  markFailed,
  findProjectPhashes,
} from '../media/repository.js';

export type MediaProcessResult =
  | { ok: true; skipped: 'missing' | 'already-ready' }
  | { ok: true; derivatives: number }
  | { ok: false; reason: string };

/**
 * Idempotent media pipeline: fetch original → validate bytes → dedup → strip+derive
 * (watermarked) → write derivatives → single atomic status flip to ready. Permanent
 * failures (invalid/duplicate) return normally (no retry); transient errors rethrow so
 * BullMQ retries with backoff (E-112). Deterministic derivative keys make re-runs overwrite.
 */
export async function processMedia(job: Job<MediaProcessJob>): Promise<MediaProcessResult> {
  const { imageId } = job.data;
  const image = await getImageForProcessing(imageId);
  if (!image) return { ok: true, skipped: 'missing' };
  if (image.status === 'ready') return { ok: true, skipped: 'already-ready' };

  try {
    const original = await getObject(image.originalKey);

    const validation = await validateImageBytes(original, image.contentType ?? '');
    if (!validation.ok) {
      await markFailed(imageId);
      return { ok: false, reason: validation.reason };
    }

    const phash = await computePhash(original);
    const candidates = await findProjectPhashes(image.projectId, imageId);
    const duplicate = findNearestDuplicate(phash, candidates, config.MEDIA_DEDUP_HAMMING_THRESHOLD);
    if (duplicate) {
      await markFailed(imageId);
      return { ok: false, reason: 'duplicate' };
    }

    const generated = await generateDerivatives(original, { watermark: defaultWatermarkConfig });
    const derivatives = await Promise.all(
      generated.map(async (d) => {
        const key = buildDerivativeKey(image.projectId, imageId, d.variant, d.format);
        await putObject({ key, body: d.buffer, contentType: d.contentType });
        return { variant: d.variant, format: d.format, key, width: d.width, height: d.height };
      }),
    );

    await markReady(imageId, {
      derivatives,
      width: validation.width,
      height: validation.height,
      phash,
    });
    return { ok: true, derivatives: derivatives.length };
  } catch (err) {
    await markFailed(imageId);
    throw err;
  }
}
