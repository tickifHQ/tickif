import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type * as Billing from '@repo/billing';
vi.mock('@repo/billing', async (original) => ({
  ...(await original<typeof Billing>()),
  replacementRepository: { current: vi.fn().mockResolvedValue(undefined) },
}));
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  fetch: vi.fn(),
  plan: vi.fn(),
  access: vi.fn(),
  recovery: vi.fn(),
}));
vi.mock('@repo/config', () => ({
  config: {
    BETTER_AUTH_SECRET: 'test-secret-long-enough',
    RAZORPAY_KEY_ID: 'test-key',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS: 'plan_pro',
    RAZORPAY_PLAN_ID_CORPORATE: 'plan_corp',
  },
}));
vi.mock('../../../src/modules/billing/operation-repository.js', () => ({
  operationRepository: { findOpenOperation: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../../src/modules/billing/subscribe-repository.js', () => ({
  subscribeRepository: { find: mocks.find },
}));
vi.mock('../../../src/modules/billing/recovery-service.js', () => ({
  recoveryService: { get: mocks.recovery },
}));
vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: { hasCapability: mocks.access },
}));
vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  fetchSubscription: mocks.fetch,
  fetchPlan: mocks.plan,
  resolveRazorpayPlanId: (tier: string) => (tier === 'corporate' ? 'plan_corp' : 'plan_pro'),
  resolveTierFromRazorpayPlanId: (id: string) =>
    id === 'plan_corp' ? 'corporate' : id === 'plan_pro' ? 'professional_plus' : null,
}));
import {
  billingSelectionService,
  validateBillingPreview,
} from '../../../src/modules/billing/selection-service.js';
const caller = { userId: 'user1', activeOrgId: 'org1' };
const operationId = 'cd5cd966-dce7-4e91-81ad-6c113005c847';
const active = {
  id: 'sub1',
  planTier: 'professional_plus',
  razorpaySubscriptionId: 'rzp1',
  subscriptionState: 'active',
  cancelAtPeriodEnd: false,
};
const remote = {
  id: 'rzp1',
  status: 'active',
  plan_id: 'plan_pro',
  current_end: Date.parse('2026-10-01T00:00:00Z') / 1000,
  current_start: Date.parse('2026-09-01T00:00:00Z') / 1000,
  quantity: 1,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(true);
  mocks.find.mockResolvedValue(undefined);
  mocks.recovery.mockResolvedValue({ recovery: null });
  mocks.plan.mockImplementation(async (id: string) => ({
    id,
    period: 'monthly',
    interval: 1,
    item: { currency: 'INR', amount: id === 'plan_corp' ? 799900 : 299900 },
  }));
});
afterEach(() => vi.useRealTimers());
describe('billing selection and signed consent', () => {
  it('reconciles a lost cancellation after a terminal webhook cleared the local ID', async () => {
    mocks.find.mockResolvedValue({ ...active, planTier: 'hobby', razorpaySubscriptionId: null });
    mocks.pending.mockResolvedValue({
      kind: 'cancel',
      operationId,
      sourceSubscriptionId: 'rzp1',
      targetTier: 'hobby',
      status: 'reconciliation_pending',
    });
    mocks.fetch.mockResolvedValue({ ...remote, status: 'cancelled' });
    const context = await billingSelectionService.context(caller);
    expect(mocks.fetch).toHaveBeenCalledWith('rzp1');
    expect(context.pendingOperation).toBeNull();
    expect(context.actions.find((x) => x.targetTier === 'corporate')?.action).toBe('subscribe');
    expect(mocks.updateOperation).toHaveBeenCalledWith(
      'org1',
      operationId,
      expect.objectContaining({ status: 'scheduled' }),
    );
  });
  it('keeps a detached cancellation pending when its source cannot be verified', async () => {
    mocks.pending.mockResolvedValue({
      kind: 'cancel',
      operationId,
      sourceSubscriptionId: 'rzp1',
      targetTier: 'hobby',
      status: 'reconciliation_pending',
    });
    mocks.fetch.mockRejectedValue(new Error('unavailable'));
    const context = await billingSelectionService.context(caller);
    expect(context.pendingOperation?.operationId).toBe(operationId);
    expect(mocks.updateOperation).not.toHaveBeenCalled();
  });
  it('offers immediate upgrades using replacement checkout for UPI', async () => {
    mocks.find.mockResolvedValue(active);
    mocks.fetch.mockResolvedValue({ ...remote, payment_method: 'upi' });
    expect(
      await billingSelectionService.preview(caller, { targetTier: 'corporate' }),
    ).toMatchObject({
      action: 'change_plan',
      timing: 'now',
      reason: null,
    });
  });
  it('offers direct Corporate checkout without granting the target entitlement', async () => {
    const context = await billingSelectionService.context(caller);
    expect(context.currentTier).toBe('hobby');
    expect(context.actions.find((x) => x.targetTier === 'corporate')?.action).toBe('subscribe');
    const preview = await billingSelectionService.preview(caller, { targetTier: 'corporate' });
    expect(preview).toMatchObject({
      recurringAmount: 799900,
      adjustmentAmount: null,
      amountCertainty: 'unavailable',
      confirmationAllowed: true,
    });
    expect(
      (
        await validateBillingPreview(caller, {
          targetTier: 'corporate',
          previewToken: preview.previewToken,
          operationId,
        })
      ).preview.action,
    ).toBe('subscribe');
  });
  it('fails closed on outage and unknown existing checkout mapping', async () => {
    mocks.find.mockResolvedValue({ ...active, planTier: 'hobby' });
    mocks.fetch.mockRejectedValue(new Error('network'));
    expect(
      (await billingSelectionService.context(caller)).actions.every(
        (x) => x.reason === 'provider_unavailable',
      ),
    ).toBe(true);
    mocks.fetch.mockResolvedValue({
      ...remote,
      status: 'created',
      plan_id: 'unrecognized',
      notes: { tier: 'corporate' },
    });
    const context = await billingSelectionService.context(caller);
    expect(context.unfinishedCheckout?.targetTier).toBeNull();
    expect(context.actions.every((x) => x.reason === 'unknown_checkout_plan')).toBe(true);
  });
  it('quotes an exact adjustment for a separately authorized immediate upgrade', async () => {
    mocks.find.mockResolvedValue(active);
    mocks.fetch.mockResolvedValue(remote);
    expect(
      await billingSelectionService.preview(caller, { targetTier: 'corporate' }),
    ).toMatchObject({
      action: 'change_plan',
      timing: 'now',
      reason: null,
      adjustmentAmount: 133333,
      nextEligibleAction: null,
    });
  });
  it('rejects forged, expired, cross-organization and changed-provider previews', async () => {
    mocks.find.mockResolvedValue(active);
    mocks.fetch.mockResolvedValue(remote);
    const preview = await billingSelectionService.preview(caller, { targetTier: 'hobby' });
    const params = {
      targetTier: 'hobby' as const,
      previewToken: preview.previewToken,
      operationId,
    };
    await expect(
      validateBillingPreview(caller, { ...params, previewToken: `${preview.previewToken}x` }),
    ).rejects.toMatchObject({ code: 'preview_stale' });
    await expect(
      validateBillingPreview({ ...caller, activeOrgId: 'org2' }, params),
    ).rejects.toMatchObject({ code: 'preview_stale' });
    mocks.fetch.mockResolvedValue({ ...remote, quantity: 2 });
    await expect(validateBillingPreview(caller, params)).rejects.toMatchObject({
      code: 'preview_stale',
    });
    mocks.fetch.mockResolvedValue(remote);
    vi.advanceTimersByTime(300001);
    await expect(validateBillingPreview(caller, params)).rejects.toMatchObject({
      code: 'preview_stale',
    });
  });
  it('blocks reads after billing permission is revoked', async () => {
    mocks.access.mockResolvedValue(false);
    await expect(billingSelectionService.context(caller)).rejects.toMatchObject({ status: 403 });
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('does not replace inconsistent local paid access without a provider identity', async () => {
    mocks.find.mockResolvedValue({ ...active, razorpaySubscriptionId: null });
    expect(
      (await billingSelectionService.context(caller)).actions.find(
        (x) => x.targetTier === 'corporate',
      )?.reason,
    ).toBe('subscription_state_unverified');
  });
});
