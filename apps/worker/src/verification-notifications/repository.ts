import { and, asc, db, eq, isNull, schema } from '@repo/db';

export type VerificationNotificationRecord =
  typeof schema.verificationNotificationOutbox.$inferSelect;

export async function findPendingVerificationNotifications(
  limit: number,
): Promise<VerificationNotificationRecord[]> {
  return db
    .select()
    .from(schema.verificationNotificationOutbox)
    .where(isNull(schema.verificationNotificationOutbox.enqueuedAt))
    .orderBy(
      asc(schema.verificationNotificationOutbox.createdAt),
      asc(schema.verificationNotificationOutbox.id),
    )
    .limit(limit);
}

export async function markVerificationNotificationEnqueued(id: string): Promise<void> {
  await db
    .update(schema.verificationNotificationOutbox)
    .set({ enqueuedAt: new Date() })
    .where(
      and(
        eq(schema.verificationNotificationOutbox.id, id),
        isNull(schema.verificationNotificationOutbox.enqueuedAt),
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
