import { Worker } from 'bullmq';
import { connection, QUEUES, type MediaProcessJob } from './connection.js';
import { processMedia } from './jobs/media-process.js';

/**
 * Worker process. Each queue gets a Worker; handlers live under ./jobs.
 */
const mediaWorker = new Worker<MediaProcessJob>(QUEUES.media, processMedia, {
  connection,
  concurrency: 4,
});

mediaWorker.on('completed', (job) => console.log(`[worker] completed job ${job.id}`));
mediaWorker.on('failed', (job, err) => console.error(`[worker] failed job ${job?.id}:`, err));

console.log(`[worker] listening on queue "${QUEUES.media}"`);

async function shutdown() {
  console.log('[worker] shutting down...');
  await mediaWorker.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
