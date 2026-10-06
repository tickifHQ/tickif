import { EventEmitter } from 'node:events';
import type { Job, Worker } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  drainLifecycleTasks,
  failureState,
  observeWorker,
  trackLifecycleTask,
} from '../../src/observability/lifecycle.js';
import { logger } from '../../src/observability/logger.js';
import type * as LogModule from '../../src/observability/logger.js';

vi.mock('../../src/observability/logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof LogModule>()),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('worker lifecycle observation', () => {
  it('recognizes early terminal failures without exhausting configured attempts', () => {
    expect(failureState({ finishedOn: 100 })).toBe('terminal');
    expect(failureState({ finishedOn: undefined })).toBe('retry');
    expect(failureState(undefined)).toBe('unknown');
  });

  it('handles consumer errors, missing failed jobs and stalled phone-bearing IDs safely', () => {
    const events = new EventEmitter();
    Object.assign(events, { name: 'sms' });
    observeWorker(events as unknown as Worker<unknown, unknown>);
    events.emit('error', new Error('connection failed'));
    events.emit('failed', undefined, new Error('stalled limit reached'));
    events.emit('stalled', 'otp-919876543210-ab');
    const fields = vi.mocked(logger.warn).mock.calls.at(-1)?.[0];
    expect(fields).toMatchObject({ event: 'worker.stalled', queue: 'sms' });
    expect(JSON.stringify(fields)).not.toContain('919876543210');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job.failed_unknown' }),
      'Job failed',
    );
  });

  it('emits retry and terminal transitions distinctly', () => {
    const events = new EventEmitter();
    Object.assign(events, { name: 'media' });
    observeWorker(events as unknown as Worker<unknown, unknown>);
    const job = {
      id: 'media-1',
      queueName: 'media',
      name: 'process-media',
      attemptsMade: 1,
    } as Job<unknown>;
    events.emit('failed', job, new Error('retry'));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job.retry_scheduled', attempt: 1 }),
      'Job retry scheduled',
    );
    job.finishedOn = 100;
    events.emit('failed', job, new Error('permanent'));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'job.terminal_failed' }),
      'Job failed',
    );
  });

  it('awaits async failure persistence which worker.close does not await', async () => {
    let release: (() => void) | undefined;
    trackLifecycleTask(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    let drained = false;
    const pending = drainLifecycleTasks().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    release?.();
    await pending;
    expect(drained).toBe(true);
  });
});
