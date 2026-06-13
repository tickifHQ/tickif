import { Worker } from 'bullmq';
import { config, isProduction } from '@repo/config';
import { connection, QUEUES, type MediaProcessJob, type SmsJob } from './connection.js';
import { processMedia } from './jobs/media-process.js';
import { selectSmsSender } from './jobs/sms-sender.js';
import { SmsService } from './jobs/sms-service.js';

/**
 * Worker process. Each queue gets a Worker; handlers live under ./jobs.
 */
const mediaWorker = new Worker<MediaProcessJob>(QUEUES.media, processMedia, {
  connection,
  concurrency: config.MEDIA_WORKER_CONCURRENCY,
});

// Provider strategy is selected once here, then injected into the service.
const smsService = new SmsService(
  selectSmsSender({
    provider: config.SMS_PROVIDER,
    authKey: config.MSG91_AUTH_KEY,
    senderId: config.MSG91_SENDER_ID,
    isProduction,
  }),
);

const smsWorker = new Worker<SmsJob>(QUEUES.sms, (job) => smsService.send(job.data), {
  connection,
  concurrency: 4,
});

mediaWorker.on('completed', (job) => console.log(`[worker] media completed job ${job.id}`));
mediaWorker.on('failed', (job, err) =>
  console.error(`[worker] media failed job ${job?.id}:`, err),
);
smsWorker.on('completed', (job) => console.log(`[worker] sms completed job ${job.id}`));
smsWorker.on('failed', (job, err) => console.error(`[worker] sms failed job ${job?.id}:`, err));

console.log(`[worker] listening on queues "${QUEUES.media}", "${QUEUES.sms}"`);

async function shutdown() {
  console.log('[worker] shutting down...');
  await Promise.all([mediaWorker.close(), smsWorker.close()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
