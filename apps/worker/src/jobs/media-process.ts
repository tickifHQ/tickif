import type { Job } from 'bullmq';
import type { MediaProcessJob } from '../connection.js';

/**
 * Trivial proving job — confirms the producer → Redis → worker path works.
 * Later phases replace the body with the real Sharp pipeline:
 * EXIF strip → WebP/AVIF derivatives → watermark → content-hash dedup → R2.
 */
export async function processMedia(job: Job<MediaProcessJob>): Promise<{ ok: true }> {
  console.log(`[worker] media:process imageId=${job.data.imageId} key=${job.data.storageKey}`);
  return { ok: true };
}
