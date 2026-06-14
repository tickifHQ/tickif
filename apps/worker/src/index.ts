import { createServer } from 'node:http';
import sharp from 'sharp';
import { Worker } from 'bullmq';
import { config, isProduction } from '@repo/config';
import { assertMediaStorageConfig } from '@repo/storage';
import { closeQueues } from '@repo/queue';
import { connection, QUEUES, type MediaProcessJob, type SmsJob } from './connection.js';
import { processMedia } from './jobs/media-process.js';
import { markFailed } from './media/repository.js';
import { selectSmsSender } from './jobs/sms-sender.js';
import { SmsService } from './jobs/sms-service.js';

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
    await Promise.all([mediaWorker.close(), smsWorker.close()]);
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
