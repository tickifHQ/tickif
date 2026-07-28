import { enqueueBookingNotification } from '@repo/queue';
import {
  findPendingBookingNotifications,
  markBookingNotificationEnqueued,
} from '../booking-notifications/repository.js';

const DISPATCH_BATCH_SIZE = 50;

export type BookingNotificationSweepResult = {
  enqueued: number;
  failed: number;
};

/**
 * Hands transactional booking-notification intents to BullMQ. A failed enqueue
 * leaves the row pending for the next sweep; stable queue and provider keys make
 * a retry after an uncertain handoff safe.
 *
 * Failures are isolated per row on purpose. The batch is read `created_at ASC`, so
 * a row that fails durably would otherwise starve every notification behind it —
 * the same 50 rows, in the same order, failing at the same head, every 30 seconds.
 */
export async function processBookingNotificationSweep(): Promise<BookingNotificationSweepResult> {
  const pending = await findPendingBookingNotifications(DISPATCH_BATCH_SIZE);
  let enqueued = 0;
  let failed = 0;

  for (const notification of pending) {
    try {
      await enqueueBookingNotification({
        bookingId: notification.bookingId,
        phoneNumber: notification.phoneNumber,
        requesterName: notification.requesterName,
      });
      await markBookingNotificationEnqueued(notification.id);
      enqueued += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[worker] booking-notification ${notification.id} (booking ${notification.bookingId}) enqueue failed:`,
        error,
      );
    }
  }

  return { enqueued, failed };
}
