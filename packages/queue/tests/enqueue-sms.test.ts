import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { addMock, closeMock, upsertJobSchedulerMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  closeMock: vi.fn(),
  upsertJobSchedulerMock: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return {
      add: addMock,
      close: closeMock,
      upsertJobScheduler: upsertJobSchedulerMock,
    };
  }),
}));

describe('enqueueSms', () => {
  beforeEach(() => {
    vi.resetModules();
    addMock.mockReset();
    closeMock.mockReset();
    upsertJobSchedulerMock.mockReset();
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
      { kind: 'otp', phoneNumber: '919876543210', code: '123456' },
      // defaultJobOptions lives on the Queue now, so add() only carries the dedupe id
      { jobId: expect.stringMatching(/^otp-919876543210-[a-f0-9]{16}$/) },
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

  it('adds a booking-requested job to the SMS queue with its own payload', async () => {
    const { enqueueBookingNotification, JOBS } = await import('../src/index.js');

    await enqueueBookingNotification({
      phoneNumber: '+91 98765 43210',
      bookingId: 'booking-123',
      requesterName: 'Aarav Shah',
    });

    expect(addMock).toHaveBeenCalledWith(
      JOBS.sendBookingRequestedSms,
      {
        kind: 'booking-requested',
        phoneNumber: '919876543210',
        bookingId: 'booking-123',
        requesterName: 'Aarav Shah',
      },
      {
        jobId: expect.stringMatching(/^booking-requested-[a-f0-9]{16}$/),
        removeOnComplete: { age: 24 * 3600, count: 5000 },
      },
    );
  });

  it('deduplicates booking-requested jobs across phone formatting differences', async () => {
    const { enqueueBookingNotification } = await import('../src/index.js');
    const booking = {
      bookingId: 'booking-123',
      requesterName: 'Aarav Shah',
    };

    await enqueueBookingNotification({ ...booking, phoneNumber: '+91 98765 43210' });
    await enqueueBookingNotification({ ...booking, phoneNumber: '+919876543210' });

    const firstJobId = addMock.mock.calls[0]?.[2]?.jobId;
    const secondJobId = addMock.mock.calls[1]?.[2]?.jobId;
    expect(firstJobId).toBe(secondJobId);
  });

  it('registers one stable booking-notification outbox sweep', async () => {
    const {
      BOOKING_NOTIFICATIONS_SWEEP_SCHEDULER,
      JOBS,
      scheduleBookingNotificationSweep,
    } = await import('../src/index.js');

    await scheduleBookingNotificationSweep(30_000);

    expect(upsertJobSchedulerMock).toHaveBeenCalledWith(
      BOOKING_NOTIFICATIONS_SWEEP_SCHEDULER,
      { every: 30_000 },
      {
        name: JOBS.sweepBookingNotifications,
        data: { kind: 'booking-notification-sweep' },
      },
    );
  });
});
