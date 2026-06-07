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
      // phone is normalized to digits once, up front, before enqueue
      { phoneNumber: '919876543210', code: '123456' },
      {
        ...defaultJobOptions,
        jobId: expect.stringMatching(/^otp-919876543210-[a-f0-9]{16}$/),
      },
    );
  });

  it('produces the same jobId for one number regardless of formatting', async () => {
    const { enqueueSms } = await import('../src/index.js');

    await enqueueSms({ phoneNumber: '+91 98765 43210', code: '123456' });
    await enqueueSms({ phoneNumber: '+919876543210', code: '123456' });

    const firstJobId = addMock.mock.calls[0]?.[2]?.jobId;
    const secondJobId = addMock.mock.calls[1]?.[2]?.jobId;
    expect(firstJobId).toBe(secondJobId);
  });
});
