import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, schema, eq } from '@repo/db';
import { makeSubscription } from '@repo/db/testing';
import {
  replacementProvider,
  replacementRepository,
  reconcileReplacement,
  applyReplacementSchedule,
  cancelReplacementRenewal,
} from '@repo/billing';
import type { RazorpaySubscription } from '@repo/contracts';

const end = new Date('2026-10-01T00:00:00Z');
const now = new Date('2026-09-15T00:00:00Z');
const operationId = 'f9722d1a-343d-42b0-961e-78c72e54839c';
async function setup(downgrade = false) {
  const local = await makeSubscription({
    planTier: downgrade ? 'corporate' : 'professional_plus',
    subscriptionState: 'active',
    razorpaySubscriptionId: 'sub_source',
    razorpayStatus: 'active',
    currentPeriodEnd: end,
  });
  await db.insert(schema.billingOperation).values({
    operationId,
    organizationId: local.organizationId,
    targetTier: downgrade ? 'professional_plus' : 'corporate',
    kind: 'change_plan',
    stateRevision: 'reviewed',
    sourceSubscriptionId: 'sub_source',
  });
  await replacementRepository.insert({
    id: operationId,
    organizationId: local.organizationId,
    sourceSubscriptionId: 'sub_source',
    replacementSubscriptionId: 'sub_next',
    sourceTier: downgrade ? 'corporate' : 'professional_plus',
    targetTier: downgrade ? 'professional_plus' : 'corporate',
    targetPlanId: 'plan_target',
    amount: downgrade ? 0 : 250000,
    recurringAmount: downgrade ? 299900 : 799900,
    currency: 'INR',
    periodEnd: end,
    expiresAt: new Date(now.getTime() + 900000),
    status: 'checkout',
    orderId: downgrade ? null : 'order_upgrade',
  });
  const remote: RazorpaySubscription = {
    id: 'sub_next',
    entity: 'subscription',
    plan_id: 'plan_target',
    status: 'authenticated',
    current_start: null,
    current_end: null,
    start_at: end.getTime() / 1000,
    short_url: null,
    created_at: now.getTime() / 1000,
  };
  let stopped = false;
  vi.spyOn(replacementProvider, 'subscription').mockImplementation(async (id) =>
    id === 'sub_next'
      ? remote
      : {
          ...remote,
          id,
          plan_id: 'plan_source',
          status: 'active',
          current_end: end.getTime() / 1000,
          cancel_at_cycle_end: stopped,
        },
  );
  vi.spyOn(replacementProvider, 'cancel').mockImplementation(async (id) => {
    if (id === 'sub_next') {
      remote.status = 'cancelled';
      return remote;
    }
    stopped = true;
    return { ...remote, id: 'sub_source', cancel_at_cycle_end: true };
  });
  vi.spyOn(replacementProvider, 'payments').mockResolvedValue([
    {
      id: 'pay_upgrade',
      order_id: 'order_upgrade',
      amount: 250000,
      amount_refunded: 0,
      currency: 'INR',
      status: 'captured',
      created_at: now.getTime() / 1000,
    },
  ]);
  return local;
}
afterEach(() => vi.restoreAllMocks());
describe('replacement billing database transitions', () => {
  async function upgradeThenReviewDowngrade() {
    const local = await setup();
    await reconcileReplacement(local.organizationId, now);
    const previous = (await replacementRepository.current(local.organizationId))!;
    const successorId = '75c23b21-0f48-4c8e-baa1-f16d34d6123c';
    const next = {
      ...previous,
      id: successorId,
      supersedesId: previous.id,
      sourceSubscriptionId: 'sub_next',
      sourceTier: 'corporate' as const,
      targetTier: 'professional_plus' as const,
      targetPlanId: 'plan_pro',
      replacementSubscriptionId: 'sub_downgrade',
      orderId: null,
      paymentId: null,
      amount: 0,
      recurringAmount: 299900,
      status: 'checkout' as const,
      sourceStoppedAt: null,
      createdAt: new Date(previous.createdAt.getTime() + 1000),
    };
    await replacementRepository.reserve(next);
    const originalFetch = vi.mocked(replacementProvider.subscription).getMockImplementation()!;
    const source = await originalFetch('sub_next');
    const mandate = {
      ...source,
      id: 'sub_downgrade',
      plan_id: 'plan_pro',
      status: 'created' as string,
    };
    vi.mocked(replacementProvider.subscription).mockImplementation(async (id) =>
      id === source.id ? source : id === mandate.id ? mandate : originalFetch(id),
    );
    vi.mocked(replacementProvider.cancel).mockImplementation(async (id) => {
      const remote = id === source.id ? source : mandate;
      remote.status = 'cancelled';
      return remote;
    });
    return { local, previous, next, source, mandate };
  }

  it('keeps the paid Corporate upgrade while an unused downgrade checkout expires', async () => {
    const { local, previous, next, mandate } = await upgradeThenReviewDowngrade();
    await reconcileReplacement(local.organizationId, now);
    expect(replacementProvider.cancel).toHaveBeenCalledTimes(1); // original source only
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'corporate',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_next',
      currentPeriodEnd: end,
    });
    mandate.status = 'expired';
    await reconcileReplacement(local.organizationId, new Date(next.expiresAt.getTime() + 1000));
    expect(await replacementRepository.current(local.organizationId)).toMatchObject({
      id: previous.id,
      status: 'confirmed',
    });
    expect(await db.select().from(schema.paymentTransaction)).toHaveLength(1);
  });

  it('replaces only the future Corporate mandate after downgrade authorization and applies Professional+ at the boundary', async () => {
    const { local, previous, next, mandate, source } = await upgradeThenReviewDowngrade();
    mandate.status = 'authenticated';
    source.cancel_at_cycle_end = true; // A schedule flag cannot prove a future mandate stopped.
    await reconcileReplacement(local.organizationId, now);
    expect(replacementProvider.cancel).toHaveBeenLastCalledWith('sub_next', false);
    expect(await replacementRepository.current(local.organizationId)).toMatchObject({
      id: next.id,
      status: 'confirmed',
    });
    expect(
      await db
        .select()
        .from(schema.billingReplacement)
        .where(eq(schema.billingReplacement.id, previous.id)),
    ).toEqual([
      expect.objectContaining({
        status: 'completed',
        paymentId: 'pay_upgrade',
        targetTier: 'corporate',
      }),
    ]);
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'corporate',
      subscriptionState: 'active',
      razorpaySubscriptionId: 'sub_downgrade',
      currentPeriodEnd: end,
    });
    await reconcileReplacement(local.organizationId, now); // late/repeated callback cannot restore Corporate renewal
    expect(replacementProvider.cancel).toHaveBeenCalledTimes(2);
    vi.mocked(replacementProvider.subscription).mockRejectedValue(new Error('provider outage'));
    await expect(reconcileReplacement(local.organizationId, end)).rejects.toThrow(
      'provider outage',
    );
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'professional_plus',
      subscriptionState: 'grace',
      graceStartedAt: end,
    });
  });

  it('retains paid access and retries an uncertain future-mandate cancellation without creating another checkout', async () => {
    const { local, previous, mandate, source } = await upgradeThenReviewDowngrade();
    mandate.status = 'authenticated';
    vi.mocked(replacementProvider.cancel).mockImplementation(async () => {
      source.status = 'cancelled';
      throw new Error('lost cancellation response');
    });
    await expect(reconcileReplacement(local.organizationId, now)).rejects.toThrow(
      'lost cancellation response',
    );
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'corporate',
      currentPeriodEnd: end,
    });
    expect(
      await db
        .select()
        .from(schema.billingReplacement)
        .where(eq(schema.billingReplacement.id, previous.id)),
    ).toEqual([expect.objectContaining({ status: 'confirmed' })]);
    await reconcileReplacement(local.organizationId, now);
    expect(await replacementRepository.current(local.organizationId)).toMatchObject({
      status: 'confirmed',
      targetTier: 'professional_plus',
    });
    expect(replacementProvider.cancel).toHaveBeenCalledTimes(2); // source upgrade cancellation + one downgrade attempt
  });
  it.each(['active', 'cancelled'])(
    'preserves a new Corporate cycle when its source is %s',
    async (status) => {
      const { local, previous, mandate, source } = await upgradeThenReviewDowngrade();
      mandate.status = 'authenticated';
      source.status = status;
      source.current_end = Math.floor(end.getTime() / 1000) + 30 * 86400;
      await reconcileReplacement(local.organizationId, now);
      expect(await replacementRepository.current(local.organizationId)).toMatchObject({
        status: 'aborting',
      });
      expect(replacementProvider.cancel).toHaveBeenCalledTimes(1); // the original Professional+ source, never the renewed Corporate mandate
      await reconcileReplacement(local.organizationId, now);
      expect(replacementProvider.cancel).toHaveBeenLastCalledWith('sub_downgrade', false);
      expect(await replacementRepository.current(local.organizationId)).toMatchObject({
        id: previous.id,
      });
      expect((await db.select().from(schema.subscription))[0]).toMatchObject({
        planTier: 'corporate',
      });
    },
  );
  it('cancels a confirmed upgrade and converges a pending cancellation without losing the paid period', async () => {
    const local = await setup();
    await reconcileReplacement(local.organizationId, now);
    const cancellationId = 'fe28fa46-2a45-48b6-876c-0aa5f2b09adf';
    await db.insert(schema.billingOperation).values({
      operationId: cancellationId,
      organizationId: local.organizationId,
      targetTier: 'hobby',
      kind: 'cancel',
      status: 'reconciliation_pending',
      stateRevision: 'reviewed',
      sourceSubscriptionId: 'sub_next',
    });
    await cancelReplacementRenewal(local.organizationId);
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'corporate',
      currentPeriodEnd: end,
      cancelAtPeriodEnd: true,
    });
    expect(
      (
        await db
          .select()
          .from(schema.billingOperation)
          .where(eq(schema.billingOperation.operationId, cancellationId))
      )[0],
    ).toMatchObject({ status: 'scheduled' });
    await applyReplacementSchedule(local.organizationId, end);
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'hobby',
      subscriptionState: 'active',
      razorpaySubscriptionId: null,
      currentPeriodEnd: null,
    });
    expect(await replacementRepository.current(local.organizationId)).toBeUndefined();
  });
  it('serializes concurrent confirmations and records the payment exactly once', async () => {
    const local = await setup();
    await Promise.all([
      reconcileReplacement(local.organizationId, now),
      reconcileReplacement(local.organizationId, now),
    ]);
    expect(replacementProvider.cancel).toHaveBeenCalledTimes(1);
    expect(await db.select().from(schema.paymentTransaction)).toHaveLength(1);
    const [result] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, local.id));
    expect(result).toMatchObject({
      planTier: 'corporate',
      razorpaySubscriptionId: 'sub_next',
      currentPeriodEnd: end,
    });
    expect(await replacementRepository.byProvider('sub_source')).toMatchObject({
      sourceSubscriptionId: 'sub_source',
      replacementSubscriptionId: 'sub_next',
      status: 'confirmed',
    });
  });
  it('retains the source tier before a downgrade and commits the boundary during a provider outage', async () => {
    const local = await setup(true);
    await reconcileReplacement(local.organizationId, now);
    expect((await db.select().from(schema.subscription))[0]?.planTier).toBe('corporate');
    vi.mocked(replacementProvider.subscription).mockRejectedValue(new Error('outage'));
    await expect(reconcileReplacement(local.organizationId, end)).rejects.toThrow('outage');
    expect((await db.select().from(schema.subscription))[0]).toMatchObject({
      planTier: 'professional_plus',
      subscriptionState: 'grace',
      graceStartedAt: end,
    });
    expect(
      await applyReplacementSchedule(local.organizationId, new Date(end.getTime() + 1000)),
    ).toBe(false);
  });
  it('keeps paid access and the operation pending after an uncertain cancellation', async () => {
    const local = await setup();
    vi.mocked(replacementProvider.cancel).mockRejectedValue(new Error('timeout'));
    await expect(reconcileReplacement(local.organizationId, now)).rejects.toThrow('timeout');
    expect((await db.select().from(schema.subscription))[0]?.planTier).toBe('professional_plus');
    expect(await replacementRepository.current(local.organizationId)).toMatchObject({
      status: 'checkout',
    });
  });
  it('rejects overlapping replacements at the database boundary', async () => {
    const local = await setup();
    const existing = (await replacementRepository.current(local.organizationId))!;
    await expect(
      replacementRepository.insert({
        ...existing,
        id: 'c3850915-43bf-49aa-891c-5ce580c9aef4',
        replacementSubscriptionId: 'sub_other',
        orderId: 'order_other',
      }),
    ).rejects.toThrow();
  });
});
