import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLogContext } from '@repo/logger/server';
import { businessOutcome, jobFields, observeProcessor } from '../../src/observability/processor.js';
import { logger, safeJobKey } from '../../src/observability/logger.js';
import type * as LogModule from '../../src/observability/logger.js';

vi.mock('../../src/observability/logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof LogModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function job(id: string): Job<{ id: string }> {
  return { id, name: 'send-sms', queueName: 'sms', attemptsMade: 0, data: { id } } as Job<{
    id: string;
  }>;
}

describe('job observation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('isolates async context between simultaneous jobs and restores the caller', async () => {
    const releases = new Map<string, () => void>();
    const observed = observeProcessor<{ id: string }, string>(async (item) => {
      expect(getLogContext()?.job_key).toBe(safeJobKey(item.id));
      await new Promise<void>((resolve) => releases.set(item.data.id, resolve));
      expect(getLogContext()?.job_key).toBe(safeJobKey(item.id));
      return item.data.id;
    });
    const first = observed(job('otp-919876543210-a'), 'token');
    const second = observed(job('otp-919800000000-b'), 'token');
    releases.get('otp-919800000000-b')?.();
    await expect(second).resolves.toBe('otp-919800000000-b');
    releases.get('otp-919876543210-a')?.();
    await expect(first).resolves.toBe('otp-919876543210-a');
    expect(getLogContext()).toEqual({});
  });

  it('never binds raw phone-bearing IDs or unknown job names', () => {
    const item = job('otp-919876543210-a');
    item.name = 'private-phone-919876543210';
    expect(jobFields(item)).toEqual({
      queue: 'sms',
      job_name: 'unknown',
      job_key: safeJobKey(item.id),
      attempt: 1,
    });
    expect(JSON.stringify(jobFields(item))).not.toContain('919876543210');
  });

  it('rethrows attempt errors so BullMQ retains retry responsibility', async () => {
    const error = new Error('transient');
    const processor = observeProcessor<{ id: string }, unknown>(async () => {
      throw error;
    });
    await expect(processor(job('job-1'), 'token')).rejects.toBe(error);
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'job.attempt_failed', err: error },
      'Job attempt failed',
    );
  });

  it('distinguishes business rejections and partial sweeps from completed transport', () => {
    expect(businessOutcome({ ok: false, reason: 'duplicate' })).toEqual({
      outcome: 'rejected',
      reason: 'duplicate',
    });
    expect(businessOutcome({ ok: false, reason: 'secret@example.com' })).toEqual({
      outcome: 'rejected',
      reason: 'unknown',
    });
    expect(businessOutcome({ enqueued: 0, failed: 2 })).toEqual({
      outcome: 'partial_failure',
      failed: 2,
    });
    expect(businessOutcome({ enqueued: 0, failed: 0, exhausted: 2 })).toEqual({
      outcome: 'partial_failure',
      failed: 2,
    });
    expect(businessOutcome({ graceFailures: 1, recoveryFailures: 2 })).toEqual({
      outcome: 'partial_failure',
      failed: 3,
    });
    expect(businessOutcome({ ok: true, skipped: 'already-ready' })).toEqual({ outcome: 'skipped' });
    expect(businessOutcome({ enqueued: 0, failed: 0 })).toEqual({ outcome: 'success' });
  });
});
