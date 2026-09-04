import { db, eq, schema } from '@repo/db';
import { SUBSCRIPTION_STATE } from '@repo/contracts';

type FailedPaymentInput = {
  subscriptionId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  razorpayStatus: string;
  payload: Record<string, unknown>;
};

export type FailedPaymentWriteResult = 'processed' | 'duplicate' | 'invalid_transition';

/**
 * Records a failed payment and advances the subscription under one row lock.
 * The payment ID remains the idempotency key when Razorpay retries the event.
 */
export async function recordFailedPayment(
  input: FailedPaymentInput,
): Promise<FailedPaymentWriteResult> {
  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .select({ subscriptionState: schema.subscription.subscriptionState })
      .from(schema.subscription)
      .where(eq(schema.subscription.id, input.subscriptionId))
      .limit(1)
      .for('update');

    if (!subscription) return 'invalid_transition';

    if (subscription.subscriptionState !== SUBSCRIPTION_STATE.ACTIVE) {
      const [existingPayment] = await tx
        .select({ id: schema.paymentTransaction.id })
        .from(schema.paymentTransaction)
        .where(eq(schema.paymentTransaction.razorpayPaymentId, input.razorpayPaymentId))
        .limit(1);
      return existingPayment ? 'duplicate' : 'invalid_transition';
    }

    const [inserted] = await tx
      .insert(schema.paymentTransaction)
      .values({
        subscriptionId: input.subscriptionId,
        razorpayPaymentId: input.razorpayPaymentId,
        amount: input.amount,
        currency: input.currency,
        status: 'failed',
        payload: input.payload,
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.paymentTransaction.razorpayPaymentId })
      .returning({ id: schema.paymentTransaction.id });

    if (!inserted) return 'duplicate';

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
