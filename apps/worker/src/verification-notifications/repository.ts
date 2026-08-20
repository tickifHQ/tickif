import { and, asc, db, eq, gte, isNull, lt, or, schema, sql } from '@repo/db';

export type VerificationNotificationRecord =
  typeof schema.verificationNotificationOutbox.$inferSelect;

export async function findPendingVerificationNotifications(
  limit: number,
  staleBefore: Date,
  maxDeliveryAttempts: number,
): Promise<VerificationNotificationRecord[]> {
  return db
    .select()
    .from(schema.verificationNotificationOutbox)
    .where(
      and(
        isNull(schema.verificationNotificationOutbox.sentAt),
        isNull(schema.verificationNotificationOutbox.failedAt),
        lt(schema.verificationNotificationOutbox.deliveryAttempts, maxDeliveryAttempts),
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

export async function markExhaustedVerificationNotifications(
  maxDeliveryAttempts: number,
  staleBefore: Date,
  failedAt: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(schema.verificationNotificationOutbox)
    .set({ failedAt })
    .where(
      and(
        isNull(schema.verificationNotificationOutbox.sentAt),
        isNull(schema.verificationNotificationOutbox.failedAt),
        gte(schema.verificationNotificationOutbox.deliveryAttempts, maxDeliveryAttempts),
        lt(schema.verificationNotificationOutbox.enqueuedAt, staleBefore),
      ),
    )
    .returning({ id: schema.verificationNotificationOutbox.id });
  return rows.length;
}

export async function markVerificationNotificationEnqueued(
  id: string,
  enqueuedAt: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.verificationNotificationOutbox)
    .set({
      enqueuedAt,
      deliveryAttempts: sql`${schema.verificationNotificationOutbox.deliveryAttempts} + 1`,
    })
    .where(
      and(
        eq(schema.verificationNotificationOutbox.id, id),
        isNull(schema.verificationNotificationOutbox.sentAt),
        isNull(schema.verificationNotificationOutbox.failedAt),
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
    .set({ sentAt: new Date(), failedAt: null })
    .where(
      and(
        eq(schema.verificationNotificationOutbox.id, id),
        isNull(schema.verificationNotificationOutbox.sentAt),
      ),
    );
}
