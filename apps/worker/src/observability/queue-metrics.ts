import { getTelemetryConfig } from '@repo/config/telemetry';
import { readQueueMetrics, closeQueueMetrics, type QueueSnapshot } from '@repo/queue/metrics';
import { metrics } from '@repo/telemetry/node';
import { logger } from './logger.js';

const POLL_INTERVAL_MS = 30_000;
const MAX_SNAPSHOT_AGE_MS = 2 * POLL_INTERVAL_MS;

/** Enable on exactly one designated owner: these queue counts are Redis-global. */
export function startQueueMetrics(): { stop(): Promise<void> } {
  const config = getTelemetryConfig();
  if (!config.TELEMETRY_ENABLED || !config.TELEMETRY_QUEUE_METRICS_ENABLED) {
    return { stop: async () => undefined };
  }
  const meter = metrics.getMeter('tickif-queue-observer');
  const counts = meter.createObservableGauge('tickif.queue.jobs', { unit: '{job}' });
  const age = meter.createObservableGauge('tickif.queue.next_waiting_job_age', { unit: 's' });
  let snapshot: QueueSnapshot[] = [];
  let updatedAt = 0;
  let pending: Promise<void> | undefined;
  let stopped = false;
  const callback: Parameters<typeof meter.addBatchObservableCallback>[0] = (result) => {
    if (stopped || Date.now() - updatedAt > MAX_SNAPSHOT_AGE_MS) return;
    for (const item of snapshot) {
      for (const [state, count] of Object.entries(item.counts)) {
        result.observe(counts, count, { queue: item.queue, state });
      }
      result.observe(
        age,
        item.nextWaitingCreatedAt === null
          ? 0
          : Math.max(0, Date.now() - item.nextWaitingCreatedAt) / 1_000,
        { queue: item.queue },
      );
    }
  };
  meter.addBatchObservableCallback(callback, [counts, age]);
  const poll = () => {
    if (pending || stopped) return;
    pending = readQueueMetrics()
      .then((value) => {
        if (!stopped) {
          snapshot = value;
          updatedAt = Date.now();
        }
      })
      .catch((err: unknown) => {
        logger.warn({ event: 'queue.metrics_failed', err }, 'Queue metric snapshot failed');
      })
      .finally(() => {
        pending = undefined;
      });
  };
  poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  timer.unref();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      meter.removeBatchObservableCallback(callback, [counts, age]);
      await closeQueueMetrics();
      await pending;
    },
  };
}
