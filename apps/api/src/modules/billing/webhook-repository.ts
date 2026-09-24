import { and, db, eq, gte, schema } from '@repo/db';
import { SUBSCRIPTION_STATE, type PlanTier, type RazorpaySubscription } from '@repo/contracts';
import { recordSearchProjectionEvents } from '../search-index/repository.js';

/** Fetch authoritative state inside the row lock: delayed updates cannot restore an old plan. */
export async function reconcileUpdatedSubscription(
  id: string,
  providerId: string,
  fetchCurrent: () => Promise<RazorpaySubscription & { tier: PlanTier | null }>,
): Promise<{ outcome: 'processed' | 'duplicate' } | { outcome: 'ignored'; reason: string }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.subscription)
      .where(
        and(
          eq(schema.subscription.id, id),
          eq(schema.subscription.razorpaySubscriptionId, providerId),
        ),
      )
      .limit(1)
      .for('update');
    if (!current) return { outcome: 'ignored', reason: 'Subscription is no longer current' };
    const live = await fetchCurrent();
    if (
      live.id !== providerId ||
      live.status !== 'active' ||
      !live.tier ||
      live.has_scheduled_changes
    ) {
      return {
        outcome: 'ignored',
        reason: 'Current paid plan is not confirmed or change is still scheduled',
      };
    }
    // Lifecycle recovery requires the activation/payment path, not an update notification.
    if (current.subscriptionState !== SUBSCRIPTION_STATE.ACTIVE || current.planTier === 'hobby') {
      return { outcome: 'ignored', reason: 'Update cannot activate or recover a subscription' };
    }
    if (current.planTier === live.tier) return { outcome: 'duplicate' };
    await tx
      .update(schema.subscription)
      .set({ planTier: live.tier, razorpayStatus: live.status })
      .where(eq(schema.subscription.id, id));
    const profiles = await tx
      .select({ id: schema.designerProfile.id })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.orgId, current.organizationId));
    await recordSearchProjectionEvents(
      tx,
      profiles.map((profile) => ({
        entityKind: 'designer' as const,
        entityId: profile.id,
        operation: 'index' as const,
        sourceUpdatedAt: new Date(),
      })),
    );
    // No payment is manufactured: charge/refund events retain their own financial records.
    return { outcome: 'processed' };
  });
}

type FailedPaymentInput = {
  subscriptionId: string;
  razorpaySubscriptionId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  razorpayStatus: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export type FailedPaymentWriteResult =
  'processed' | 'duplicate' | 'invalid_transition' | 'not_current';

/**
 * Records a failed payment and advances an active subscription under one row lock.
 * The payment ID remains the idempotency key when Razorpay retries the event.
 */
export async function recordFailedPayment(
  input: FailedPaymentInput,
): Promise<FailedPaymentWriteResult> {
  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .select({
        subscriptionState: schema.subscription.subscriptionState,
        planTier: schema.subscription.planTier,
        razorpayStatus: schema.subscription.razorpayStatus,
      })
      .from(schema.subscription)
      .where(
        and(
          eq(schema.subscription.id, input.subscriptionId),
          eq(schema.subscription.razorpaySubscriptionId, input.razorpaySubscriptionId),
        ),
      )
      .limit(1)
      .for('update');

    if (!subscription) return 'not_current';

    const [inserted] = await tx
      .insert(schema.paymentTransaction)
      .values({
        subscriptionId: input.subscriptionId,
        razorpayPaymentId: input.razorpayPaymentId,
        amount: input.amount,
        currency: input.currency,
        status: 'failed',
        payload: input.payload,
        occurredAt: input.occurredAt,
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.paymentTransaction.razorpayPaymentId })
      .returning({ id: schema.paymentTransaction.id });

    if (!inserted) return 'duplicate';

    if (subscription.subscriptionState !== SUBSCRIPTION_STATE.ACTIVE) {
      return 'invalid_transition';
    }

    // Authorization attempts can fail before the first charge activates a paid
    // checkout. Keep the audit record without putting a Hobby entitlement into
    // a paid-subscription failure state.
    if (
      subscription.planTier === 'hobby' ||
      subscription.razorpayStatus === 'created' ||
      subscription.razorpayStatus === 'authenticated'
    ) {
      return 'processed';
    }

    // Webhooks can arrive out of order. A captured payment at or after this
    // attempt proves the failure is historical, so recording it must not
    // regress the current paid entitlement.
    const [laterCapture] = await tx
      .select({ id: schema.paymentTransaction.id })
      .from(schema.paymentTransaction)
      .where(
        and(
          eq(schema.paymentTransaction.subscriptionId, input.subscriptionId),
          eq(schema.paymentTransaction.status, 'captured'),
          gte(schema.paymentTransaction.occurredAt, input.occurredAt),
        ),
      )
      .limit(1);
    if (laterCapture) return 'processed';

    await tx
      .update(schema.subscription)
      .set({
        subscriptionState: SUBSCRIPTION_STATE.PAYMENT_FAILED,
        razorpayStatus: input.razorpayStatus,
      })
      .where(eq(schema.subscription.id, input.subscriptionId));

    return 'processed';
  });
}
