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

beforeEach(() => {
  vi.clearAllMocks();
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

    await expect(processBookingNotificationSweep()).resolves.toBe(1);

    expect(findPendingBookingNotifications).toHaveBeenCalledWith(50);
    expect(enqueueBookingNotification).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      phoneNumber: '919800000001',
      requesterName: 'Aarav Shah',
    });
    expect(markBookingNotificationEnqueued).toHaveBeenCalledWith('outbox-1');
  });

  it('leaves the outbox row pending when Redis rejects the handoff', async () => {
    vi.mocked(findPendingBookingNotifications).mockResolvedValue([
      {
        id: 'outbox-1',
        bookingId: 'booking-1',
        phoneNumber: '919800000001',
        requesterName: 'Aarav Shah',
      },
    ]);
    vi.mocked(enqueueBookingNotification).mockRejectedValue(new Error('Redis unavailable'));

    await expect(processBookingNotificationSweep()).rejects.toThrow('Redis unavailable');
    expect(markBookingNotificationEnqueued).not.toHaveBeenCalled();
  });
});
