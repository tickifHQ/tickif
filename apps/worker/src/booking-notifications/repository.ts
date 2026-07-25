import { and, asc, db, eq, isNull, schema } from '@repo/db';

export type PendingBookingNotification = {
  id: string;
  bookingId: string;
  phoneNumber: string;
  requesterName: string;
};

export async function findPendingBookingNotifications(
  limit: number,
): Promise<PendingBookingNotification[]> {
  return db
    .select({
      id: schema.bookingNotificationOutbox.id,
      bookingId: schema.bookingNotificationOutbox.bookingId,
      phoneNumber: schema.bookingNotificationOutbox.phoneNumber,
      requesterName: schema.bookingNotificationOutbox.requesterName,
    })
    .from(schema.bookingNotificationOutbox)
    .where(isNull(schema.bookingNotificationOutbox.enqueuedAt))
    .orderBy(
      asc(schema.bookingNotificationOutbox.createdAt),
      asc(schema.bookingNotificationOutbox.id),
    )
    .limit(limit);
}

export async function markBookingNotificationEnqueued(id: string): Promise<void> {
  await db
    .update(schema.bookingNotificationOutbox)
    .set({ enqueuedAt: new Date() })
    .where(
      and(
        eq(schema.bookingNotificationOutbox.id, id),
        isNull(schema.bookingNotificationOutbox.enqueuedAt),
      ),
    );
}
