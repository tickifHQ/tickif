import { performance } from 'node:perf_hooks';
import type { Job, Processor } from 'bullmq';
import { imageFailureReason } from '@repo/contracts';
import { JOBS, QUEUES } from '@repo/queue';
import { runWithLogContext } from '@repo/logger/server';
import { metrics, trace, SpanStatusCode } from '@repo/telemetry/node';
import { logger, safeJobKey } from './logger.js';

const meter = metrics.getMeter('tickif-worker');
const attempts = meter.createCounter('tickif.worker.job.attempts', { unit: '{attempt}' });
const duration = meter.createHistogram('tickif.worker.job.duration', { unit: 's' });
const outcomes = meter.createCounter('tickif.worker.job.outcomes', { unit: '{job}' });
const rejections = meter.createCounter('tickif.worker.domain.rejections', { unit: '{rejection}' });
const jobNames = new Set<string>(Object.values(JOBS));
const queueNames = new Set<string>(Object.values(QUEUES));

export function safeJobName(name: string): string {
  return jobNames.has(name) ? name : 'unknown';
}

export function safeQueueName(name: string): string {
  return queueNames.has(name) ? name : 'unknown';
}

export function jobFields(job: Pick<Job<unknown>, 'id' | 'name' | 'queueName' | 'attemptsMade'>) {
  return {
    queue: safeQueueName(job.queueName),
    job_name: safeJobName(job.name),
    job_key: safeJobKey(job.id),
    attempt: job.attemptsMade + 1,
  };
}

export function businessOutcome(result: unknown): {
  outcome: string;
  reason?: string;
  failed?: number;
} {
  if (!result || typeof result !== 'object') return { outcome: 'success' };
  const value = result as Record<string, unknown>;
  if (value.ok === false) {
    const reason = imageFailureReason.safeParse(value.reason);
    return { outcome: 'rejected', reason: reason.success ? reason.data : 'unknown' };
  }
  if (typeof value.skipped === 'string') return { outcome: 'skipped' };
  const failed = [
    'failed',
    'exhausted',
    'graceFailures',
    'downgradeFailures',
    'orgExpiryFailures',
    'organizationRetentionFailures',
    'recoveryFailures',
    'replacementFailures',
    'refundFailures',
  ].reduce(
    (count, key) =>
      count +
      (typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(0, value[key]) : 0),
    0,
  );
  return failed > 0 ? { outcome: 'partial_failure', failed } : { outcome: 'success' };
}

/** Each execution owns its context, including concurrent jobs and retry attempts. */
export function observeProcessor<Data, Result>(
  processor: Processor<Data, Result>,
): Processor<Data, Result> {
  return (job, token, signal) =>
    runWithLogContext(jobFields(job), async () => {
      const started = performance.now();
      const labels = { queue: safeQueueName(job.queueName), 'job.type': safeJobName(job.name) };
      let outcome = 'exception';
      attempts.add(1, labels);
      logger.debug({ event: 'job.started' }, 'Job started');
      try {
        const result = await processor(job, token, signal);
        const business = businessOutcome(result);
        outcome = business.outcome;
        outcomes.add(1, {
          ...labels,
          outcome,
          ...(business.reason ? { reason: business.reason } : {}),
        });
        if (outcome === 'rejected' || outcome === 'partial_failure') {
          logger.warn(
            { event: 'job.business_failure', ...business },
            'Job completed with business failures',
          );
        }
        return result;
      } catch (err) {
        // Native BullMQ spans also cover this attempt; mark that span instead of duplicating it.
        trace.getActiveSpan()?.setStatus({ code: SpanStatusCode.ERROR });
        logger.warn({ event: 'job.attempt_failed', err }, 'Job attempt failed');
        throw err;
      } finally {
        duration.record((performance.now() - started) / 1_000, { ...labels, outcome });
      }
    });
}

export function recordDomainRejection(
  queue: string,
  name: string,
  reason: 'google_reviews_rejected',
): void {
  rejections.add(1, { queue: safeQueueName(queue), 'job.type': safeJobName(name), reason });
  logger.warn({ event: 'job.domain_rejected', reason }, 'Job rejected by provider');
}
