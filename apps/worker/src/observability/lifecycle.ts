import type { Job, Worker } from 'bullmq';
import { metrics } from '@repo/telemetry/node';
import { jobFields, safeJobName, safeQueueName } from './processor.js';
import { logger, safeJobKey } from './logger.js';

const meter = metrics.getMeter('tickif-worker');
const transitions = meter.createCounter('tickif.worker.job.transitions', { unit: '{job}' });
const errors = meter.createCounter('tickif.worker.errors', { unit: '{error}' });
const pendingTasks = new Set<Promise<unknown>>();

/** Async EventEmitter listeners are not awaited by worker.close(). Track persistence explicitly. */
export function trackLifecycleTask(task: Promise<unknown>): void {
  pendingTasks.add(task);
  void task.finally(() => pendingTasks.delete(task)).catch(() => undefined);
}

export async function drainLifecycleTasks(): Promise<void> {
  while (pendingTasks.size > 0) await Promise.allSettled([...pendingTasks]);
}

export function failureState(
  job: Pick<Job<unknown>, 'finishedOn'> | undefined,
): 'terminal' | 'retry' | 'unknown' {
  // BullMQ sets finishedOn on the final transition, including unrecoverable/discarded jobs.
  // attemptsMade alone would mistake early terminal failures for retryable errors.
  return job ? (job.finishedOn !== undefined ? 'terminal' : 'retry') : 'unknown';
}

export function observeWorker<Data, Result>(worker: Worker<Data, Result>): void {
  const queue = safeQueueName(worker.name);
  worker.on('completed', (job) => {
    transitions.add(1, { queue, 'job.type': safeJobName(job.name), outcome: 'completed' });
    logger.info(
      { ...jobFields(job), attempt: job.attemptsMade, event: 'job.completed' },
      'Job completed',
    );
  });
  worker.on('failed', (job, err) => {
    const state = failureState(job);
    const fields = {
      ...(job ? jobFields(job) : { queue, job_name: 'unknown' }),
      attempt: job?.attemptsMade,
      event:
        state === 'terminal'
          ? 'job.terminal_failed'
          : state === 'retry'
            ? 'job.retry_scheduled'
            : 'job.failed_unknown',
      err,
    };
    transitions.add(1, {
      queue,
      'job.type': job ? safeJobName(job.name) : 'unknown',
      outcome: state,
    });
    if (state === 'retry') logger.warn(fields, 'Job retry scheduled');
    else logger.error(fields, 'Job failed');
  });
  worker.on('error', (err) => {
    errors.add(1, { queue, reason: 'consumer_error' });
    logger.error({ event: 'worker.error', queue, err }, 'Worker consumer error');
  });
  worker.on('stalled', (id) => {
    errors.add(1, { queue, reason: 'stalled' });
    logger.warn({ event: 'worker.stalled', queue, job_key: safeJobKey(id) }, 'Job stalled');
  });
  worker.on('lockRenewalFailed', (ids) => {
    errors.add(ids.length, { queue, reason: 'lock_renewal_failed' });
    logger.warn(
      { event: 'worker.lock_renewal_failed', queue, count: ids.length },
      'Job lock renewal failed',
    );
  });
}
