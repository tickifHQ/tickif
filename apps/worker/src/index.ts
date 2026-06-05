import { Worker } from 'bullmq';
import { connection, QUEUES, type MediaProcessJob, type SmsJob } from './connection.js';
import { processMedia } from './jobs/media-process.js';
import { processSms } from './jobs/sms-send.js';

/**
 * Worker process. Each queue gets a Worker; handlers live under ./jobs.
 */
const mediaWorker = new Worker<MediaProcessJob>(QUEUES.media, processMedia, {
  connection,
  concurrency: 4,
});

const smsWorker = new Worker<SmsJob>(QUEUES.sms, processSms, {
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
