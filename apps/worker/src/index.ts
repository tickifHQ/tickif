import { createServer } from 'node:http';
import sharp from 'sharp';
import { Worker } from 'bullmq';
import { config, isProduction } from '@repo/config';
import { assertMediaStorageConfig } from '@repo/storage';
import { isGooglePlacesConfigured } from '@repo/google-places';
import {
  closeQueues,
  scheduleBookingNotificationSweep,
  scheduleGoogleReviewsSweep,
} from '@repo/queue';
import {
  connection,
  QUEUES,
  JOBS,
  type MediaProcessJob,
  type SmsQueueJob,
  type GoogleReviewsRefreshJob,
  type GoogleReviewsSweepJob,
} from './connection.js';
import { processMedia } from './jobs/media-process.js';
import { markFailed } from './media/repository.js';
import { selectSmsSender } from './jobs/sms-sender.js';
import { SmsService } from './jobs/sms-service.js';
import { processBookingNotificationSweep } from './jobs/booking-notifications.js';
import {
  processGoogleReviewRefresh,
  processGoogleReviewSweep,
} from './jobs/google-reviews.js';

/**
 * Worker process. Each queue gets a Worker; handlers live under ./jobs.
 */
assertMediaStorageConfig();

// One libvips thread per job so BullMQ concurrency is the only parallelism knob, and no
// cross-job operation cache in a long-running process — both bound worker memory.
sharp.concurrency(1);
sharp.cache(false);

const mediaWorker = new Worker<MediaProcessJob>(QUEUES.media, processMedia, {
  connection,
  concurrency: config.MEDIA_WORKER_CONCURRENCY,
});

// Provider strategy is selected once here, then injected into the service.
const smsService = new SmsService(
  selectSmsSender({
    provider: config.SMS_PROVIDER,
    novuSecretKey: config.NOVU_SECRET_KEY,
    novuWorkflowId: config.NOVU_OTP_WORKFLOW_ID,
    novuBookingWorkflowId: config.NOVU_BOOKING_WORKFLOW_ID,
    novuApiUrl: config.NOVU_API_URL,
    isProduction,
  }),
);

const smsWorker = new Worker<SmsQueueJob>(
  QUEUES.sms,
  async (job) => {
    if (job.name === JOBS.sweepBookingNotifications) {
      const { enqueued, failed } = await processBookingNotificationSweep();
      // Report failures separately: an all-failing batch and an empty one both
      // enqueue zero, and only one of them is a problem.
      console.log(
        `[worker] booking-notifications sweep: enqueued ${enqueued}, failed ${failed}`,
      );
      return;
    }
    await smsService.send(job.data);
  },
  {
    connection,
    concurrency: 4,
  },
);
void scheduleBookingNotificationSweep(30_000).catch((err) =>
  console.error('[worker] failed to register booking-notifications sweep:', err),
);

// Google reviews worker + periodic sweep — only when a Places API key is set.
let googleReviewsWorker: Worker<GoogleReviewsRefreshJob | GoogleReviewsSweepJob> | undefined;
if (isGooglePlacesConfigured()) {
  googleReviewsWorker = new Worker<GoogleReviewsRefreshJob | GoogleReviewsSweepJob>(
    QUEUES.googleReviews,
    async (job) => {
      if (job.name === JOBS.sweepGoogleReviews) {
        const result = await processGoogleReviewSweep();
        console.log(
          `[worker] google-reviews sweep: purged ${result.purged}, enqueued ${result.enqueued}`,
        );
        return;
      }
      await processGoogleReviewRefresh((job.data as GoogleReviewsRefreshJob).profileId);
    },
    { connection, concurrency: 4 },
  );
  googleReviewsWorker.on('completed', (job) =>
    console.log(`[worker] google-reviews completed job ${job.id}`),
  );
  googleReviewsWorker.on('failed', (job, err) =>
    console.error(`[worker] google-reviews failed job ${job?.id}:`, err),
  );
  // Register the repeatable hourly sweep (idempotent via stable scheduler id).
  void scheduleGoogleReviewsSweep(60 * 60 * 1000).catch((err) =>
    console.error('[worker] failed to register google-reviews sweep:', err),
  );
  console.log('[worker] google-reviews worker + hourly sweep registered');
}

mediaWorker.on('completed', (job) => console.log(`[worker] media completed job ${job.id}`));
mediaWorker.on('failed', async (job, err) => {
  console.error(`[worker] media failed job ${job?.id}:`, err);
  // Persist 'failed' only once retries are exhausted, so a transient error doesn't flap the status.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await markFailed(job.data.imageId).catch((e) =>
      console.error(`[worker] media ${job.data.imageId}: terminal markFailed failed`, e),
    );
  }
});
smsWorker.on('completed', (job) => console.log(`[worker] sms completed job ${job.id}`));
smsWorker.on('failed', (job, err) => console.error(`[worker] sms failed job ${job?.id}:`, err));

let draining = false;

// Liveness = process up; readiness flips to 503 on shutdown so an orchestrator stops routing first.
const health = createServer((req, res) => {
  if (req.url === '/livez') return void res.writeHead(200).end('ok');
  if (req.url === '/readyz') return void res.writeHead(draining ? 503 : 200).end(draining ? 'draining' : 'ready');
  res.writeHead(404).end();
});
health.listen(config.WORKER_HEALTH_PORT);

console.log(
  `[worker] listening on queues "${QUEUES.media}", "${QUEUES.sms}"; health on :${config.WORKER_HEALTH_PORT}`,
);

async function shutdown(signal: string): Promise<void> {
  draining = true;
  console.log(`[worker] ${signal} received, draining...`);
  let code = 0;
  try {
    await Promise.all([mediaWorker.close(), smsWorker.close(), googleReviewsWorker?.close()]);
    await closeQueues();
  } catch (err) {
    console.error('[worker] error during shutdown:', err);
    code = 1;
  } finally {
    health.close();
    process.exit(code);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
