import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { AppError } from '../../lib/errors.js';

export type SubscriptionUpdate = Partial<typeof schema.subscription.$inferInsert>;

function queries(connection: Pick<typeof db, 'select' | 'update' | 'insert'>) {
  return {
    async find(organizationId: string) {
      const [row] = await connection
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, organizationId))
        .limit(1);
      return row;
    },
    async update(id: string, updates: SubscriptionUpdate) {
      await connection
        .update(schema.subscription)
        .set(updates)
        .where(eq(schema.subscription.id, id));
    },
    async create(values: typeof schema.subscription.$inferInsert) {
      await connection.insert(schema.subscription).values(values);
    },
    async acknowledgePayment(id: string, providerId: string) {
      // A late/replayed browser callback must never overwrite a webhook transition.
      await connection
        .update(schema.subscription)
        .set({ razorpayStatus: 'authenticated' })
        .where(
          and(
            eq(schema.subscription.id, id),
            eq(schema.subscription.razorpaySubscriptionId, providerId),
            eq(schema.subscription.razorpayStatus, 'created'),
          ),
        );
    },
  };
}

export const subscribeRepository = {
  ...queries(db),
  async withOrganizationLock<T>(
    organizationId: string,
    action: (repository: ReturnType<typeof queries>) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${organizationId}`}, 0))`,
      );
      const [retention] = await tx
        .select({ id: schema.organizationRetention.organizationId })
        .from(schema.organizationRetention)
        .where(eq(schema.organizationRetention.organizationId, organizationId))
        .limit(1);
      if (retention) throw AppError.forbidden('Organization billing access required');
      // Unlike FOR UPDATE alone, this serializes the very first checkout with no row yet.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`organization-billing:${organizationId}`}, 0))`,
      );
      // Coordinate with webhook/lifecycle updates, which also lock/update this row.
      await tx
        .select({ id: schema.subscription.id })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, organizationId))
        .for('update');
      return action(queries(tx));
    });
  },
  async payments(organizationId: string, offset: number, limit: number) {
    return db
      .select({
        id: schema.paymentTransaction.razorpayPaymentId,
        amount: schema.paymentTransaction.amount,
        currency: schema.paymentTransaction.currency,
        status: schema.paymentTransaction.status,
        occurredAt: schema.paymentTransaction.occurredAt,
      })
      .from(schema.paymentTransaction)
      .innerJoin(
        schema.subscription,
        eq(schema.subscription.id, schema.paymentTransaction.subscriptionId),
      )
      .where(eq(schema.subscription.organizationId, organizationId))
      .orderBy(desc(schema.paymentTransaction.occurredAt), desc(schema.paymentTransaction.id))
      .offset(offset)
      .limit(limit);
  },
};
