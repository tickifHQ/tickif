import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

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

describe('enqueueSms', () => {
  beforeEach(() => {
    vi.resetModules();
    addMock.mockReset();
    closeMock.mockReset();
  });

  afterEach(async () => {
    const { closeQueues } = await import('../src/index.js');
    await closeQueues();
  });

  it('adds an OTP SMS job with retry and cleanup options', async () => {
    const { enqueueSms, JOBS, QUEUES, defaultJobOptions } = await import('../src/index.js');
    const { Queue } = await import('bullmq');

    await enqueueSms({ phoneNumber: '+919876543210', code: '123456' });

    expect(Queue).toHaveBeenCalledWith(
      QUEUES.sms,
      expect.objectContaining({ defaultJobOptions }),
    );
    expect(addMock).toHaveBeenCalledWith(
      JOBS.sendSms,
      { phoneNumber: '+919876543210', code: '123456' },
      {
        ...defaultJobOptions,
        jobId: expect.stringMatching(/^otp-919876543210-[a-f0-9]{16}$/),
      },
    );
  });
});
