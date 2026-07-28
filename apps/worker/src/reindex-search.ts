import { enqueueSearchReindexAll } from '@repo/queue';

const requestedAtEpoch = Date.now();

try {
  await enqueueSearchReindexAll({ requestedAtEpoch });
  console.log(`[worker] enqueued search reindex ${requestedAtEpoch}`);
  process.exit(0);
} catch (error) {
  console.error('[worker] failed to enqueue search reindex:', error);
  process.exit(1);
}
