import { Queue } from 'bullmq';
import { connection, QUEUES, type MediaProcessJob } from './connection.js';

/** One-shot helper to prove the queue wiring: `pnpm --filter @repo/worker enqueue:demo`. */
const queue = new Queue<MediaProcessJob>(QUEUES.media, { connection });

await queue.add('media:process', {
  imageId: 'demo-' + Date.now(),
  storageKey: 'demo/original.jpg',
});

console.log('[worker] enqueued demo media:process job');
await queue.close();
process.exit(0);
