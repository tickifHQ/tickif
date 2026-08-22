import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addMock, closeMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  closeMock: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return {
      add: addMock,
      close: closeMock,
    };
  }),
}));

describe('verification notification queue', () => {
  beforeEach(() => {
    vi.resetModules();
    addMock.mockReset();
    closeMock.mockReset();
  });

  afterEach(async () => {
    const { closeQueues } = await import('../src/index.js');
    await closeQueues();
  });

  it('removes terminally failed email jobs so the outbox sweep can redrive them', async () => {
    const { enqueueVerificationEmail, JOBS } = await import('../src/index.js');
    const job = {
      kind: 'verification-email' as const,
      outboxId: '0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
    };

    await enqueueVerificationEmail(job);

    expect(addMock).toHaveBeenCalledWith(JOBS.sendVerificationEmail, job, {
      jobId: `${JOBS.sendVerificationEmail}-${job.outboxId}`,
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: true,
    });
  });
});
