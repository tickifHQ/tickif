import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import { makeOrganization, makeUser } from '@repo/db/testing';

vi.mock('@repo/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      RAZORPAY_KEY_ID: 'rzp_test_fixture',
      RAZORPAY_KEY_SECRET: 'billing-test-secret',
      RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_pro',
      RAZORPAY_PLAN_ID_CORPORATE: 'plan_corp',
    },
  };
});
vi.mock('../../../src/modules/billing/razorpay-client.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/modules/billing/razorpay-client.js')>();
  return {
    ...actual,
    createSubscription: vi.fn(),
    fetchSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    updateSubscription: vi.fn(),
  };
});
const provider = await import('../../../src/modules/billing/razorpay-client.js');
const { subscribeService } = await import('../../../src/modules/billing/subscribe-service.js');

async function owner() {
  const user = await makeUser();
  const org = await makeOrganization();
  await db.insert(schema.member).values({
    id: `owner-${org.id}`,
    userId: user.id,
    organizationId: org.id,
    role: 'owner',
    createdAt: new Date(),
  });
  return { userId: user.id, activeOrgId: org.id };
}
async function subscription(
  caller: Awaited<ReturnType<typeof owner>>,
  overrides: Partial<typeof schema.subscription.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.subscription)
    .values({
      organizationId: caller.activeOrgId,
      planTier: 'professional_plus',
      subscriptionState: 'active',
      razorpaySubscriptionId: `sub_${caller.activeOrgId}`,
      razorpayStatus: 'active',
      ...overrides,
    })
    .returning();
  return row!;
}
function remote(id: string, status = 'active') {
  return {
    id,
    entity: 'subscription' as const,
    plan_id: 'plan_pro',
    status,
    current_start: 1788220800,
    current_end: 1790812800,
    short_url: null,
    created_at: 1788220800,
  };
}
function callback(id: string, paymentId = 'pay_verified') {
  return {
    razorpaySubscriptionId: id,
    razorpayPaymentId: paymentId,
    razorpaySignature: createHmac('sha256', 'billing-test-secret')
      .update(`${paymentId}|${id}`)
      .digest('hex'),
  };
}

describe('billing management safety', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects another organization subscription even with a genuine signature', async () => {
    const caller = await owner();
    const other = await owner();
    const foreign = await subscription(other);
    await expect(
      subscribeService.verifyPayment(caller, callback(foreign.razorpaySubscriptionId!)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('requires live billing permission before accepting a callback or disclosing payments', async () => {
    const caller = await owner();
    const sub = await subscription(caller);
    const outsider = await makeUser();
    const forbidden = { ...caller, userId: outsider.id };
    await expect(
      subscribeService.verifyPayment(forbidden, callback(sub.razorpaySubscriptionId!)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      subscribeService.payments(forbidden, { offset: 0, limit: 20 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(subscribeService.paymentMethod(forbidden)).rejects.toMatchObject({ status: 403 });
    await expect(subscribeService.refreshSubscription(forbidden)).rejects.toMatchObject({
      status: 403,
    });
    expect(provider.fetchSubscription).not.toHaveBeenCalled();
  });
  it.each(['active', 'pending', 'halted', 'cancelled'])(
    'does not regress webhook status %s for a late or repeated valid callback',
    async (status) => {
      const caller = await owner();
      const sub = await subscription(caller, { razorpayStatus: status });
      await subscribeService.verifyPayment(caller, callback(sub.razorpaySubscriptionId!));
      await subscribeService.verifyPayment(caller, callback(sub.razorpaySubscriptionId!));
      const [stored] = await db
        .select()
        .from(schema.subscription)
        .where(eq(schema.subscription.id, sub.id));
      expect(stored!.razorpayStatus).toBe(status);
    },
  );
  it('acknowledges a signed created checkout without upgrading entitlements', async () => {
    const caller = await owner();
    const sub = await subscription(caller, { razorpayStatus: 'created', planTier: 'hobby' });
    await subscribeService.verifyPayment(caller, callback(sub.razorpaySubscriptionId!));
    const [stored] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(stored).toMatchObject({ razorpayStatus: 'authenticated', planTier: 'hobby' });
  });
  it.each(['bad', '0'.repeat(64)])('rejects malformed and wrong signatures', async (signature) => {
    const caller = await owner();
    const sub = await subscription(caller);
    await expect(
      subscribeService.verifyPayment(caller, {
        ...callback(sub.razorpaySubscriptionId!),
        razorpaySignature: signature,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('reconciles a missed plan and cycle change while provider status remains active, then becomes idempotent', async () => {
    const caller = await owner();
    const sub = await subscription(caller, { currentPeriodEnd: new Date('2026-09-01T00:00:00Z') });
    vi.mocked(provider.fetchSubscription).mockResolvedValue({
      ...remote(sub.razorpaySubscriptionId!),
      plan_id: 'plan_corp',
    });
    await expect(subscribeService.refreshSubscription(caller)).resolves.toMatchObject({
      reconciled: true,
    });
    const [stored] = await db
      .select()
      .from(schema.subscription)
      .where(eq(schema.subscription.id, sub.id));
    expect(stored).toMatchObject({
      planTier: 'corporate',
      currentPeriodEnd: new Date(1790812800 * 1000),
    });
    await expect(subscribeService.refreshSubscription(caller)).resolves.toMatchObject({
      reconciled: false,
    });
  });
  it('serializes concurrent first checkouts even when no subscription row exists', async () => {
    const caller = await owner();
    vi.mocked(provider.createSubscription).mockResolvedValue(remote('sub_first', 'created'));
    vi.mocked(provider.fetchSubscription).mockResolvedValue(remote('sub_first', 'created'));
    const results = await Promise.all([
      subscribeService.createSubscription(caller, { targetTier: 'professional_plus' }),
      subscribeService.createSubscription(caller, { targetTier: 'professional_plus' }),
    ]);
    expect(results.map((result) => result.razorpaySubscriptionId)).toEqual([
      'sub_first',
      'sub_first',
    ]);
    expect(provider.createSubscription).toHaveBeenCalledOnce();
  });
  it('serializes duplicate cancellation and blocks a subsequent plan change', async () => {
    const caller = await owner();
    const sub = await subscription(caller);
    vi.mocked(provider.cancelSubscription).mockResolvedValue(remote(sub.razorpaySubscriptionId!));
    const results = await Promise.all([
      subscribeService.cancelSubscription(caller),
      subscribeService.cancelSubscription(caller),
    ]);
    expect(results.map((result) => result.alreadyCancelled).sort()).toEqual([false, true]);
    expect(provider.cancelSubscription).toHaveBeenCalledOnce();
    await expect(
      subscribeService.changePlan(caller, { targetTier: 'corporate' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(provider.updateSubscription).not.toHaveBeenCalled();
  });
  it('reuses a halted mandate for payment recovery instead of creating a duplicate', async () => {
    const caller = await owner();
    const sub = await subscription(caller, { razorpayStatus: 'halted' });
    vi.mocked(provider.fetchSubscription).mockResolvedValue(
      remote(sub.razorpaySubscriptionId!, 'halted'),
    );
    await expect(subscribeService.paymentMethod(caller)).resolves.toMatchObject({
      razorpaySubscriptionId: sub.razorpaySubscriptionId,
    });
    expect(provider.createSubscription).not.toHaveBeenCalled();
  });
  it('paginates real payment amounts and never leaks another organization payments', async () => {
    const caller = await owner();
    const sub = await subscription(caller);
    const foreign = await subscription(await owner());
    await db.insert(schema.paymentTransaction).values([
      {
        subscriptionId: sub.id,
        razorpayPaymentId: 'pay_older',
        amount: 299900,
        status: 'captured',
        payload: {},
        occurredAt: new Date('2026-08-01T00:00:00Z'),
      },
      {
        subscriptionId: sub.id,
        razorpayPaymentId: 'pay_newer',
        amount: 799900,
        status: 'failed',
        payload: {},
        occurredAt: new Date('2026-09-01T00:00:00Z'),
      },
      {
        subscriptionId: foreign.id,
        razorpayPaymentId: 'pay_foreign',
        amount: 799900,
        status: 'captured',
        payload: {},
      },
    ]);
    const first = await subscribeService.payments(caller, { offset: 0, limit: 1 });
    expect(first).toMatchObject({
      items: [{ id: 'pay_newer', amount: 799900, status: 'failed' }],
      nextOffset: 1,
    });
    const last = await subscribeService.payments(caller, { offset: first.nextOffset!, limit: 1 });
    expect(last).toMatchObject({ items: [{ id: 'pay_older', amount: 299900 }], nextOffset: null });
  });
});
