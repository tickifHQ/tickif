import { db, schema, eq, asc, sql } from '@repo/db';
import type { replacementProvider } from './provider.js';

type Connection = Pick<typeof db, 'select' | 'update' | 'insert' | 'execute'>;
export type AbandonedCheckout = typeof schema.billingAbandonedCheckout.$inferSelect;

async function lockOrganization(connection: Pick<typeof db, 'execute'>, organizationId: string) {
  await connection.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${organizationId}`}, 0))`,
  );
  await connection.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`organization-billing:${organizationId}`}, 0))`,
  );
}

/** Call in the same organization-locked transaction that replaces the checkout pointer. */
export function abandonedCheckoutQueries(connection: Connection) {
  return {
    async trackAbandonedCheckout(input: {
      organizationId: string;
      razorpaySubscriptionId: string;
    }) {
      await connection.insert(schema.billingAbandonedCheckout).values(input).onConflictDoNothing();
    },
  };
}

export const abandonedCheckoutRepository = {
  ...abandonedCheckoutQueries(db),
  async byProvider(id: string) {
    return (
      await db
        .select()
        .from(schema.billingAbandonedCheckout)
        .where(eq(schema.billingAbandonedCheckout.razorpaySubscriptionId, id))
        .limit(1)
    )[0];
  },
  async candidates() {
    return db
      .select()
      .from(schema.billingAbandonedCheckout)
      .orderBy(asc(schema.billingAbandonedCheckout.updatedAt))
      .limit(20);
  },
  async touch(id: string) {
    await db
      .update(schema.billingAbandonedCheckout)
      .set({ updatedAt: new Date() })
      .where(eq(schema.billingAbandonedCheckout.razorpaySubscriptionId, id));
  },
  async locked<T>(
    id: string,
    work: (input: {
      row: AbandonedCheckout;
      currentSubscriptionId: string | null;
      recordPayment: (
        payment: Awaited<ReturnType<typeof replacementProvider.payment>>,
      ) => Promise<void>;
      resolve: () => Promise<void>;
    }) => Promise<T>,
  ) {
    const row = await this.byProvider(id);
    if (!row) return;
    // Commit the unresolved barrier before provider work: a later failure must
    // not roll it back and allow retention to erase a pending refund identity.
    await db.transaction(async (tx) => {
      await lockOrganization(tx, row.organizationId);
      await tx
        .update(schema.billingAbandonedCheckout)
        .set({ resolvedAt: null })
        .where(eq(schema.billingAbandonedCheckout.razorpaySubscriptionId, id));
    });
    return db.transaction(async (tx) => {
      await lockOrganization(tx, row.organizationId);
      const [tracked] = await tx
        .select()
        .from(schema.billingAbandonedCheckout)
        .where(eq(schema.billingAbandonedCheckout.razorpaySubscriptionId, id))
        .limit(1);
      if (!tracked) return;
      const [subscription] = await tx
        .select({
          id: schema.subscription.id,
          razorpaySubscriptionId: schema.subscription.razorpaySubscriptionId,
        })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, row.organizationId))
        .limit(1)
        .for('update');
      return work({
        row: tracked,
        currentSubscriptionId: subscription?.razorpaySubscriptionId ?? null,
        async resolve() {
          await tx
            .update(schema.billingAbandonedCheckout)
            .set({ resolvedAt: new Date() })
            .where(eq(schema.billingAbandonedCheckout.razorpaySubscriptionId, id));
        },
        async recordPayment(payment) {
          if (!subscription) return;
          await tx
            .insert(schema.paymentTransaction)
            .values({
              subscriptionId: subscription.id,
              razorpayPaymentId: payment.id,
              amount: payment.amount,
              currency: payment.currency,
              status: payment.status,
              payload: payment,
              occurredAt: new Date(payment.created_at * 1000),
              processedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.paymentTransaction.razorpayPaymentId,
              set: { status: payment.status, payload: payment, processedAt: new Date() },
            });
        },
      });
    });
  },
};
