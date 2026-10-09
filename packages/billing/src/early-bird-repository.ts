import { db, schema, eq, and, sql, asc } from '@repo/db';
import type { EarlyBirdTier } from '@repo/contracts';
import { billingQueries } from './repository.js';
type Subscription = typeof schema.subscription.$inferSelect;

export const earlyBirdRepository = {
  async find(organizationId: string): Promise<Subscription | null> {
    return (
      (
        await db
          .select()
          .from(schema.subscription)
          .where(eq(schema.subscription.organizationId, organizationId))
          .limit(1)
      )[0] ?? null
    );
  },
  async expired(now: Date) {
    return db
      .select({ organizationId: schema.subscription.organizationId })
      .from(schema.subscription)
      .where(
        and(
          sql`${schema.subscription.earlyBirdEndsAt} <= ${now}`,
          sql`${schema.subscription.razorpaySubscriptionId} is null`,
          sql`${schema.subscription.planTier} <> 'hobby'`,
        ),
      )
      .orderBy(asc(schema.subscription.earlyBirdEndsAt))
      .limit(200);
  },
  async locked<T>(
    organizationId: string,
    work: (repository: {
      find: () => Promise<Subscription | null>;
      grant: (tier: EarlyBirdTier, start: Date, end: Date) => Promise<void>;
      expire: () => Promise<void>;
    }) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${organizationId}`}, 0))`,
      );
      const retained = await tx
        .select({ id: schema.organizationRetention.organizationId })
        .from(schema.organizationRetention)
        .where(eq(schema.organizationRetention.organizationId, organizationId))
        .limit(1);
      if (retained.length) throw new Error('Organization is unavailable');
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`organization-billing:${organizationId}`}, 0))`,
      );
      await tx
        .select({ id: schema.subscription.id })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, organizationId))
        .for('update');
      const repo = billingQueries(tx);
      return work({
        find: async () => (await repo.subscription(organizationId)) ?? null,
        grant: async (tier, start, end) => {
          await tx
            .insert(schema.subscription)
            .values({ organizationId, planTier: 'hobby', subscriptionState: 'active' })
            .onConflictDoNothing({ target: schema.subscription.organizationId });
          await repo.apply(
            { organizationId },
            {
              planTier: tier,
              subscriptionState: 'active',
              earlyBirdTier: tier,
              earlyBirdStartedAt: start,
              earlyBirdEndsAt: end,
              currentPeriodEnd: end,
            },
          );
        },
        expire: async () => {
          await repo.apply(
            { organizationId },
            { planTier: 'hobby', subscriptionState: 'active', currentPeriodEnd: null },
          );
        },
      });
    });
  },
};
