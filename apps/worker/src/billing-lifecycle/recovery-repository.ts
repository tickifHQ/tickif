import { and, asc, db, eq, inArray, schema } from '@repo/db';

const OPEN = ['requested', 'waiting_for_expiry', 'eligible', 'checkout_pending'] as const;
export type RecoveryRecord = typeof schema.billingRecovery.$inferSelect;
export type RecoverySubscription = typeof schema.subscription.$inferSelect;
export type RecoveryUpdate = Pick<RecoveryRecord, 'status' | 'eligibleAt' | 'reason'>;

export async function findOpenRecoveryIntents(limit: number) {
  return db
    .select({
      id: schema.billingRecovery.id,
      organizationId: schema.billingRecovery.organizationId,
    })
    .from(schema.billingRecovery)
    .where(inArray(schema.billingRecovery.status, OPEN))
    .orderBy(asc(schema.billingRecovery.updatedAt), asc(schema.billingRecovery.id))
    .limit(limit);
}

/** Serialize with billing mutations; provider evidence cannot race a replacement purchase. */
export async function reconcileRecoveryIntent(
  candidate: { id: string; organizationId: string },
  now: Date,
  resolve: (
    intent: RecoveryRecord,
    subscription: RecoverySubscription | null,
  ) => Promise<RecoveryUpdate>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, candidate.organizationId))
      .for('update')
      .limit(1);
    const [subscription] = await tx
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, candidate.organizationId))
      .for('update')
      .limit(1);
    const [intent] = await tx
      .select()
      .from(schema.billingRecovery)
      .where(
        and(
          eq(schema.billingRecovery.id, candidate.id),
          inArray(schema.billingRecovery.status, OPEN),
        ),
      )
      .for('update')
      .limit(1);
    if (!intent) return false;
    const update = await resolve(intent, subscription ?? null);
    if (
      ['waiting_for_expiry', 'eligible', 'checkout_pending', 'completed', 'superseded'].includes(
        update.status,
      )
    ) {
      // Resolve only recovery cancellation operations backed by this live read;
      // unrelated payment/change operations remain the API reconciler's responsibility.
      await tx
        .update(schema.billingOperation)
        .set({ status: 'scheduled', updatedAt: now })
        .where(
          and(
            eq(schema.billingOperation.organizationId, intent.organizationId),
            eq(schema.billingOperation.kind, 'recover'),
            eq(schema.billingOperation.sourceSubscriptionId, intent.sourceSubscriptionId),
            inArray(schema.billingOperation.status, ['processing', 'reconciliation_pending']),
          ),
        );
    }
    const changed =
      update.status !== intent.status ||
      update.reason !== intent.reason ||
      update.eligibleAt?.getTime() !== intent.eligibleAt?.getTime();
    await tx
      .update(schema.billingRecovery)
      .set({ ...update, updatedAt: now, revision: intent.revision + Number(changed) })
      .where(
        and(
          eq(schema.billingRecovery.id, intent.id),
          eq(schema.billingRecovery.revision, intent.revision),
        ),
      );
    return changed;
  });
}
