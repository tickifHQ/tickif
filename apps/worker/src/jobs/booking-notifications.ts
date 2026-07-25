import { enqueueBookingNotification } from '@repo/queue';
import {
  findPendingBookingNotifications,
  markBookingNotificationEnqueued,
} from '../booking-notifications/repository.js';

const DISPATCH_BATCH_SIZE = 50;

/**
 * Hands transactional booking-notification intents to BullMQ. A failed enqueue
 * leaves the row pending for the next sweep; stable queue and provider keys make
 * a retry after an uncertain handoff safe.
 */
export async function processBookingNotificationSweep(): Promise<number> {
  const pending = await findPendingBookingNotifications(DISPATCH_BATCH_SIZE);
  let enqueued = 0;

  for (const notification of pending) {
    await enqueueBookingNotification({
      bookingId: notification.bookingId,
      phoneNumber: notification.phoneNumber,
      requesterName: notification.requesterName,
    });
    await markBookingNotificationEnqueued(notification.id);
    enqueued += 1;
  }

  return enqueued;
}
