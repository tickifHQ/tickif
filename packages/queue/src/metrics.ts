import { Queue } from 'bullmq';
import { config } from '@repo/config';
import { QUEUES } from './index.js';

const states = ['waiting', 'active', 'delayed', 'failed', 'paused', 'prioritized'] as const;
const queues = new Map<string, Queue<unknown>>();

export type QueueSnapshot = {
  queue: string;
  counts: Record<string, number>;
  nextWaitingCreatedAt: number | null;
};

/** Separate fail-fast Redis clients keep observation out of consumer/producer lifecycle. */
export async function readQueueMetrics(): Promise<QueueSnapshot[]> {
  return Promise.all(
    Object.values(QUEUES).map(async (name) => {
      let queue = queues.get(name);
      if (!queue) {
        queue = new Queue<unknown>(name, {
          connection: { url: config.REDIS_URL, maxRetriesPerRequest: 1, connectTimeout: 3_000 },
          skipMetasUpdate: true,
        });
        // Snapshot callers receive rejected operations; do not leave Redis errors unhandled.
        queue.on('error', () => undefined);
        queues.set(name, queue);
      }
      const [counts, waiting] = await Promise.all([
        queue.getJobCounts(...states),
        queue.getWaiting(0, 0),
      ]);
      // Age is explicitly time since creation of the next waiting job, not eligibility age.
      // Delayed/scheduled jobs are excluded and no unbounded payload scan is needed.
      return { queue: name, counts, nextWaitingCreatedAt: waiting[0]?.timestamp ?? null };
    }),
  );
}

export async function closeQueueMetrics(): Promise<void> {
  const current = [...queues.values()];
  queues.clear();
  await Promise.all(current.map((queue) => queue.close()));
}
