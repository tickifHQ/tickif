import { and, asc, db, eq, isNull, lt, or, schema } from '@repo/db';

export type VerificationNotificationRecord =
  typeof schema.verificationNotificationOutbox.$inferSelect;

export async function findPendingVerificationNotifications(
  limit: number,
  staleBefore: Date,
): Promise<VerificationNotificationRecord[]> {
  return db
    .select()
    .from(schema.verificationNotificationOutbox)
    .where(
      and(
        isNull(schema.verificationNotificationOutbox.sentAt),
        or(
          isNull(schema.verificationNotificationOutbox.enqueuedAt),
          lt(schema.verificationNotificationOutbox.enqueuedAt, staleBefore),
        ),
      ),
    )
    .orderBy(
      asc(schema.verificationNotificationOutbox.createdAt),
      asc(schema.verificationNotificationOutbox.id),
    )
    .limit(limit);
}

export async function markVerificationNotificationEnqueued(
  id: string,
  enqueuedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.verificationNotificationOutbox)
    .set({ enqueuedAt })
    .where(
      and(
        eq(schema.verificationNotificationOutbox.id, id),
        isNull(schema.verificationNotificationOutbox.sentAt),
      ),
    );
}

export async function findVerificationNotification(
  id: string,
): Promise<VerificationNotificationRecord | null> {
  const [row] = await db
    .select()
    .from(schema.verificationNotificationOutbox)
    .where(eq(schema.verificationNotificationOutbox.id, id))
    .limit(1);
  return row ?? null;
}

export async function markVerificationNotificationSent(id: string): Promise<void> {
  await db
    .update(schema.verificationNotificationOutbox)
    .set({ sentAt: new Date() })
    .where(
      and(
        eq(schema.verificationNotificationOutbox.id, id),
        isNull(schema.verificationNotificationOutbox.sentAt),
      ),
    );
}
