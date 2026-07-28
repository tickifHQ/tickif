import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/booking-notifications/repository.js', () => ({
  findPendingBookingNotifications: vi.fn(),
  markBookingNotificationEnqueued: vi.fn(),
}));

vi.mock('@repo/queue', () => ({
  enqueueBookingNotification: vi.fn(),
}));

const { processBookingNotificationSweep } = await import(
  '../../src/jobs/booking-notifications.js'
);
const { findPendingBookingNotifications, markBookingNotificationEnqueued } = await import(
  '../../src/booking-notifications/repository.js'
);
const { enqueueBookingNotification } = await import('@repo/queue');

const pending = (n: number) => ({
  id: `outbox-${n}`,
  bookingId: `booking-${n}`,
  phoneNumber: `91980000000${n}`,
  requesterName: `Requester ${n}`,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('processBookingNotificationSweep', () => {
  it('enqueues pending notifications and marks each successful handoff', async () => {
    vi.mocked(findPendingBookingNotifications).mockResolvedValue([
      {
        id: 'outbox-1',
        bookingId: 'booking-1',
        phoneNumber: '919800000001',
        requesterName: 'Aarav Shah',
      },
    ]);
    vi.mocked(enqueueBookingNotification).mockResolvedValue();
    vi.mocked(markBookingNotificationEnqueued).mockResolvedValue();

    await expect(processBookingNotificationSweep()).resolves.toEqual({
      enqueued: 1,
      failed: 0,
    });

    expect(findPendingBookingNotifications).toHaveBeenCalledWith(50);
    expect(enqueueBookingNotification).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      phoneNumber: '919800000001',
      requesterName: 'Aarav Shah',
    });
    expect(markBookingNotificationEnqueued).toHaveBeenCalledWith('outbox-1');
  });

  it('leaves the outbox row pending when Redis rejects the handoff', async () => {
    vi.mocked(findPendingBookingNotifications).mockResolvedValue([pending(1)]);
    vi.mocked(enqueueBookingNotification).mockRejectedValue(new Error('Redis unavailable'));

    await expect(processBookingNotificationSweep()).resolves.toEqual({
      enqueued: 0,
      failed: 1,
    });
    expect(markBookingNotificationEnqueued).not.toHaveBeenCalled();
  });

  // The batch is read created_at ASC, so without per-row isolation a durably failing
  // row at the head starves every notification behind it on every subsequent sweep.
  it('keeps dispatching after a failure instead of starving the rest of the batch', async () => {
    vi.mocked(findPendingBookingNotifications).mockResolvedValue([
      pending(1),
      pending(2),
      pending(3),
    ]);
    vi.mocked(enqueueBookingNotification)
      .mockRejectedValueOnce(new Error('poison row'))
      .mockResolvedValue();
    vi.mocked(markBookingNotificationEnqueued).mockResolvedValue();

    await expect(processBookingNotificationSweep()).resolves.toEqual({
      enqueued: 2,
      failed: 1,
    });

    expect(enqueueBookingNotification).toHaveBeenCalledTimes(3);
    expect(markBookingNotificationEnqueued).toHaveBeenCalledWith('outbox-2');
    expect(markBookingNotificationEnqueued).toHaveBeenCalledWith('outbox-3');
    expect(markBookingNotificationEnqueued).not.toHaveBeenCalledWith('outbox-1');
  });

  it('counts a failed mark as a failure so the sweep log is not misleading', async () => {
    vi.mocked(findPendingBookingNotifications).mockResolvedValue([pending(1), pending(2)]);
    vi.mocked(enqueueBookingNotification).mockResolvedValue();
    vi.mocked(markBookingNotificationEnqueued)
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue();

    await expect(processBookingNotificationSweep()).resolves.toEqual({
      enqueued: 1,
      failed: 1,
    });
  });
});
