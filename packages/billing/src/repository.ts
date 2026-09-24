import {
  db,
  schema,
  and,
  eq,
  or,
  notInArray,
  asc,
  sql,
  inArray,
  freezeMembersToLimitOnTx,
  restoreMembersToLimitOnTx,
  SEARCH_PROJECTION_ADVISORY_LOCK_KEY,
  type DbTransaction,
} from '@repo/db';
import { seatLimit, branchLimit, type PlanTier, type SubscriptionState } from '@repo/contracts';

export type Replacement = typeof schema.billingReplacement.$inferSelect;
export type NewReplacement = typeof schema.billingReplacement.$inferInsert;
const open = notInArray(schema.billingReplacement.status, ['completed', 'failed']);

function queries(tx: DbTransaction) {
  return {
    async finishCancellation(row: Replacement) {
      const pending = await tx
        .select()
        .from(schema.billingOperation)
        .where(
          and(
            eq(schema.billingOperation.organizationId, row.organizationId),
            eq(schema.billingOperation.kind, 'cancel'),
            inArray(schema.billingOperation.status, ['processing', 'reconciliation_pending']),
          ),
        );
      for (const operation of pending)
        await tx
          .update(schema.billingOperation)
          .set({
            status: 'scheduled',
            result: {
              operationId: operation.operationId,
              targetTier: 'hobby',
              outcome: 'scheduled',
              razorpaySubscriptionId: row.replacementSubscriptionId ?? '',
              effectiveAt: row.periodEnd.toISOString(),
              currentPeriodEnd: row.periodEnd.toISOString(),
              alreadyCancelled: true,
            },
          })
          .where(eq(schema.billingOperation.operationId, operation.operationId));
    },
    async update(id: string, values: Partial<NewReplacement>) {
      await tx
        .update(schema.billingReplacement)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.billingReplacement.id, id));
    },
    async subscription(org: string) {
      return (
        await tx
          .select()
          .from(schema.subscription)
          .where(eq(schema.subscription.organizationId, org))
          .limit(1)
      )[0];
    },
    async apply(row: Replacement, values: Partial<typeof schema.subscription.$inferInsert>) {
      const local = await this.subscription(row.organizationId);
      if (!local) return;
      const changes = Object.entries(values).some(([key, value]) => {
        const current = local[key as keyof typeof local];
        return current instanceof Date && value instanceof Date
          ? current.getTime() !== value.getTime()
          : current !== value;
      });
      if (!changes) return;
      await tx
        .update(schema.subscription)
        .set(values)
        .where(eq(schema.subscription.organizationId, row.organizationId));
      if (
        values.planTier &&
        values.subscriptionState &&
        (values.planTier !== local.planTier || values.subscriptionState !== local.subscriptionState)
      ) {
        await reconcileResources(tx, row.organizationId, values.planTier, values.subscriptionState);
      }
      const profiles = await tx
        .select({ id: schema.designerProfile.id })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.orgId, row.organizationId));
      if (profiles.length) {
        await tx.execute(
          sql`select pg_advisory_xact_lock_shared(${SEARCH_PROJECTION_ADVISORY_LOCK_KEY})`,
        );
        await tx.insert(schema.searchProjectionOutbox).values(
          profiles.map(({ id }) => ({
            entityId: id,
            entityKind: 'designer' as const,
            operation: 'index' as const,
            sourceUpdatedAt: new Date(),
          })),
        );
      }
    },
    async payment(
      org: string,
      payment: { id: string; amount: number; currency: string; status: string; created_at: number },
    ) {
      const local = await this.subscription(org);
      if (!local) return;
      await tx
        .insert(schema.paymentTransaction)
        .values({
          subscriptionId: local.id,
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
          set: { status: payment.status, processedAt: new Date() },
        });
    },
    async operation(row: Replacement, status: 'scheduled' | 'activated' | 'failed') {
      await tx
        .update(schema.billingOperation)
        .set({
          status,
          result: {
            operationId: row.id,
            targetTier: row.targetTier,
            outcome: status,
            effectiveAt:
              status === 'activated' && row.targetTier === 'corporate'
                ? (row.sourceStoppedAt ?? row.createdAt).toISOString()
                : row.periodEnd.toISOString(),
            razorpaySubscriptionId: row.replacementSubscriptionId ?? '',
          },
        })
        .where(eq(schema.billingOperation.operationId, row.id));
      await tx
        .update(schema.billingRecovery)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(
          and(
            eq(schema.billingRecovery.organizationId, row.organizationId),
            notInArray(schema.billingRecovery.status, ['completed', 'dismissed', 'superseded']),
          ),
        );
    },
  };
}

export const replacementRepository = {
  async cancellationPending(org: string) {
    return (
      (
        await db
          .select({ id: schema.billingOperation.operationId })
          .from(schema.billingOperation)
          .where(
            and(
              eq(schema.billingOperation.organizationId, org),
              eq(schema.billingOperation.kind, 'cancel'),
              inArray(schema.billingOperation.status, ['processing', 'reconciliation_pending']),
            ),
          )
          .limit(1)
      ).length > 0
    );
  },
  async update(id: string, values: Partial<NewReplacement>) {
    return db.transaction((tx) => queries(tx).update(id, values));
  },
  async insert(values: NewReplacement) {
    await db.insert(schema.billingReplacement).values(values);
  },
  async current(org: string) {
    return (
      await db
        .select()
        .from(schema.billingReplacement)
        .where(and(eq(schema.billingReplacement.organizationId, org), open))
        .limit(1)
    )[0];
  },
  async byProvider(id: string) {
    return (
      await db
        .select()
        .from(schema.billingReplacement)
        .where(
          or(
            eq(schema.billingReplacement.sourceSubscriptionId, id),
            eq(schema.billingReplacement.replacementSubscriptionId, id),
          ),
        )
        .orderBy(asc(schema.billingReplacement.createdAt))
    ).at(-1);
  },
  async byOrder(id: string) {
    return (
      await db
        .select()
        .from(schema.billingReplacement)
        .where(eq(schema.billingReplacement.orderId, id))
        .limit(1)
    )[0];
  },
  async candidates() {
    return db
      .select({
        id: schema.billingReplacement.id,
        organizationId: schema.billingReplacement.organizationId,
      })
      .from(schema.billingReplacement)
      .where(open)
      .orderBy(asc(schema.billingReplacement.updatedAt))
      .limit(100);
  },
  async abandonedOrders() {
    return db
      .select()
      .from(schema.billingReplacement)
      .where(
        and(
          eq(schema.billingReplacement.status, 'failed'),
          sql`${schema.billingReplacement.orderId} is not null`,
        ),
      )
      .orderBy(asc(schema.billingReplacement.updatedAt))
      .limit(20);
  },
  async locked<T>(
    org: string,
    work: (row: Replacement | undefined, repo: ReturnType<typeof queries>) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock_shared(hashtextextended(${`organization-retention:${org}`}, 0))`,
      );
      if (
        (
          await tx
            .select()
            .from(schema.organizationRetention)
            .where(eq(schema.organizationRetention.organizationId, org))
            .limit(1)
        ).length
      )
        return undefined;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`organization-billing:${org}`}, 0))`,
      );
      await tx
        .select({ id: schema.subscription.id })
        .from(schema.subscription)
        .where(eq(schema.subscription.organizationId, org))
        .for('update');
      const [row] = await tx
        .select()
        .from(schema.billingReplacement)
        .where(and(eq(schema.billingReplacement.organizationId, org), open))
        .limit(1);
      return work(row, queries(tx));
    });
  },
};

async function reconcileResources(
  tx: DbTransaction,
  org: string,
  tier: PlanTier,
  state: SubscriptionState,
) {
  // Shared seat helpers accept the transaction's query interface.
  await freezeMembersToLimitOnTx(tx, {
    organizationId: org,
    activeLimit: seatLimit(tier, state),
    now: new Date(),
  });
  await restoreMembersToLimitOnTx(tx, { organizationId: org, activeLimit: seatLimit(tier, state) });
  const branches = await tx
    .select()
    .from(schema.team)
    .where(eq(schema.team.organizationId, org))
    .orderBy(asc(schema.team.createdAt), asc(schema.team.id))
    .for('update');
  const limit = branchLimit(tier, state);
  const allowed = limit < 0 ? branches.length : limit;
  const frozen: string[] = [];
  for (const [i, branch] of branches.entries()) {
    const freeze = i >= allowed;
    if (freeze !== branch.frozen)
      await tx
        .update(schema.team)
        .set({
          frozen: freeze,
          frozenAt: freeze ? new Date() : null,
          freezeRank: freeze ? i + 1 : null,
        })
        .where(eq(schema.team.id, branch.id));
    if (freeze) frozen.push(branch.id);
  }
  if (frozen.length)
    await tx
      .update(schema.session)
      .set({ activeTeamId: null })
      .where(inArray(schema.session.activeTeamId, frozen));
}
