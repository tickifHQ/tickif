import { describe, expect, it } from 'vitest';
import { db, schema } from '@repo/db';
import { makeConsultationBooking } from '@repo/db/testing';
import {
  findPendingBookingNotifications,
  markBookingNotificationEnqueued,
} from '../../src/booking-notifications/repository.js';

describe('booking notification outbox repository', () => {
  it('lists pending rows and removes marked handoffs from the pending set', async () => {
    const booking = await makeConsultationBooking();
    const [outbox] = await db
      .insert(schema.bookingNotificationOutbox)
      .values({
        bookingId: booking.id,
        phoneNumber: '919800000001',
        requesterName: 'Aarav Shah',
      })
      .returning();

    await expect(findPendingBookingNotifications(50)).resolves.toEqual([
      {
        id: outbox!.id,
        bookingId: booking.id,
        phoneNumber: '919800000001',
        requesterName: 'Aarav Shah',
      },
    ]);

    await markBookingNotificationEnqueued(outbox!.id);

    await expect(findPendingBookingNotifications(50)).resolves.toEqual([]);
  });
});
