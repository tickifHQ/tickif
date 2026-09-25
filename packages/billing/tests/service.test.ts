import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Replacement } from '../src/repository.js';
const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  payments: vi.fn(),
  cancel: vi.fn(),
  refund: vi.fn(),
  apply: vi.fn(),
  update: vi.fn(),
  operation: vi.fn(),
  payment: vi.fn(),
  local: vi.fn(),
  locked: vi.fn(),
  insert: vi.fn(),
  create: vi.fn(),
  createOrder: vi.fn(),
  capture: vi.fn(),
  current: vi.fn(),
  cancellationPending: vi.fn(),
  finishCancellation: vi.fn(),
  invoices: vi.fn(),
}));
vi.mock('../src/repository.js', () => ({
  replacementRepository: {
    locked: mocks.locked,
    insert: mocks.insert,
    update: mocks.update,
    current: mocks.current,
    cancellationPending: mocks.cancellationPending,
  },
}));
vi.mock('../src/provider.js', () => ({ replacementProvider: mocks }));
import {
  reconcileReplacement,
  createReplacement,
  cancelReplacementRenewal,
  applyReplacementSchedule,
  refundAbandonedReplacement,
  auditSupersededAgreement,
} from '../src/service.js';
import { upgradeAmount } from '../src/quote.js';

const now = new Date('2026-09-15T00:00:00Z');
const end = new Date('2026-10-01T00:00:00Z');
let row: Replacement;
let source: { id: string; status: string; current_end: number; cancel_at_cycle_end?: boolean };
let mandate: {
  id: string;
  plan_id: string;
  status: string;
  start_at: number;
  current_end: number | null;
};
const payment = {
  id: 'pay_upgrade',
  order_id: 'order_upgrade',
  amount: 250000,
  currency: 'INR',
  status: 'captured',
  amount_refunded: 0,
  created_at: now.getTime() / 1000,
};
beforeEach(() => {
  vi.resetAllMocks();
  row = {
    id: 'operation',
    organizationId: 'org',
    sourceSubscriptionId: 'old',
    replacementSubscriptionId: 'new',
    orderId: 'order_upgrade',
    paymentId: null,
    sourceTier: 'professional_plus',
    targetTier: 'corporate',
    targetPlanId: 'plan_corporate',
    amount: 250000,
    recurringAmount: 799900,
    currency: 'INR',
    periodEnd: end,
    expiresAt: new Date(now.getTime() + 900000),
    status: 'checkout',
    sourceStoppedAt: null,
    updatedAt: now,
    createdAt: now,
  };
  source = {
    id: 'old',
    status: 'active',
    current_end: end.getTime() / 1000,
    cancel_at_cycle_end: false,
  };
  mandate = {
    id: 'new',
    plan_id: 'plan_corporate',
    status: 'authenticated',
    start_at: end.getTime() / 1000,
    current_end: null,
  };
  mocks.subscription.mockImplementation(async (id: string) => (id === 'old' ? source : mandate));
  mocks.local.mockResolvedValue({
    razorpaySubscriptionId: 'old',
    subscriptionState: 'active',
    graceStartedAt: null,
  });
  mocks.payments.mockResolvedValue([payment]);
  mocks.capture.mockResolvedValue({ ...payment, status: 'authorized' });
  mocks.cancel.mockImplementation(async (id: string) => {
    if (id === 'old') source.cancel_at_cycle_end = true;
    else mandate.status = 'cancelled';
    return id === 'old' ? source : mandate;
  });
  mocks.locked.mockImplementation(
    async (_org: string, fn: (value: Replacement, repo: unknown) => Promise<unknown>) =>
      fn(row, { ...mocks, subscription: mocks.local }),
  );
});
describe('replacement mandate transitions', () => {
  it('accepts successful cycle-end cancellation without an undocumented response flag', async () => {
    delete source.cancel_at_cycle_end;
    mocks.cancel.mockResolvedValue({ ...source });
    await reconcileReplacement('org', now);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planTier: 'corporate' }),
    );
  });
  it('does not repeat an acknowledged source cancellation when fetch omits the flag', async () => {
    delete source.cancel_at_cycle_end;
    mocks.local.mockResolvedValue({
      razorpaySubscriptionId: 'old',
      subscriptionState: 'active',
      cancelAtPeriodEnd: true,
    });
    await reconcileReplacement('org', now);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cancelAtPeriodEnd: false }),
    );
  });
  it('retains replacement cancellation after a captured renewal without a provider flag', async () => {
    row.status = 'confirmed';
    mandate.status = 'active';
    mandate.current_end = end.getTime() / 1000 + 30 * 86400;
    mocks.local.mockResolvedValue({
      razorpaySubscriptionId: 'new',
      subscriptionState: 'grace',
      cancelAtPeriodEnd: true,
    });
    mocks.invoices.mockResolvedValue([
      {
        subscription_id: 'new',
        status: 'paid',
        payment_id: 'pay_renewal',
        billing_start: end.getTime() / 1000,
        currency: 'INR',
        amount_paid: row.recurringAmount,
      },
    ]);
    mocks.payment.mockResolvedValue({ ...payment, id: 'pay_renewal', amount: row.recurringAmount });
    await reconcileReplacement('org', end);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ cancelAtPeriodEnd: true }),
    );
  });
  it('preserves the new billing cycle when cancellation races renewal', async () => {
    row.status = 'confirmed';
    mandate.status = 'active';
    mandate.current_end = end.getTime() / 1000 + 30 * 86400;
    mocks.local.mockResolvedValue({
      razorpaySubscriptionId: 'new',
      planTier: 'corporate',
      subscriptionState: 'grace',
    });
    mocks.subscription.mockImplementation(async () => ({ ...mandate, cancel_at_cycle_end: true }));
    const result = await cancelReplacementRenewal('org');
    expect(result?.currentPeriodEnd).toBe(new Date(mandate.current_end * 1000).toISOString());
    expect(mocks.cancel).not.toHaveBeenCalledWith('new', false);
    // Keep reconciliation open until the new cycle's captured invoice is verified.
    expect(mocks.update).not.toHaveBeenCalledWith(row.id, { status: 'completed' });
    expect(mocks.apply).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planTier: 'hobby' }),
    );
  });
  it('cancels future renewals while preserving paid upgrade access through the original boundary', async () => {
    row.status = 'confirmed';
    mocks.local.mockResolvedValue({
      razorpaySubscriptionId: 'new',
      planTier: 'corporate',
      subscriptionState: 'active',
    });
    await cancelReplacementRenewal('org');
    expect(mocks.cancel).toHaveBeenCalledWith('new', false);
    expect(mocks.update).toHaveBeenCalledWith(row.id, {
      targetTier: 'hobby',
      sourceTier: 'corporate',
    });
    expect(mocks.apply).toHaveBeenCalledWith(row, {
      cancelAtPeriodEnd: true,
      razorpayStatus: 'cancelled',
    });
    expect(mocks.finishCancellation).toHaveBeenCalledWith(row);
    row.targetTier = 'hobby';
    await applyReplacementSchedule('org', end);
    expect(mocks.apply).toHaveBeenLastCalledWith(
      row,
      expect.objectContaining({
        planTier: 'hobby',
        subscriptionState: 'active',
        razorpaySubscriptionId: null,
      }),
    );
  });
  it('does not claim cancellation when the new mandate remains live', async () => {
    row.status = 'confirmed';
    mocks.local.mockResolvedValue({ razorpaySubscriptionId: 'new', planTier: 'corporate' });
    mocks.cancel.mockResolvedValue(undefined);
    await expect(cancelReplacementRenewal('org')).rejects.toThrow('Cancellation is pending');
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.finishCancellation).not.toHaveBeenCalled();
  });
  it('requires a captured renewal invoice before leaving collection grace', async () => {
    row.status = 'confirmed';
    mandate.status = 'active';
    mandate.current_end = end.getTime() / 1000 + 30 * 86400;
    mocks.invoices.mockResolvedValue([
      {
        subscription_id: 'new',
        status: 'paid',
        payment_id: 'pay_renewal',
        billing_start: end.getTime() / 1000,
        currency: 'INR',
        amount_paid: row.recurringAmount,
      },
    ]);
    mocks.payment.mockResolvedValue({ ...payment, id: 'pay_renewal', amount: row.recurringAmount });
    await reconcileReplacement('org', end);
    expect(mocks.update).toHaveBeenCalledWith(row.id, { status: 'completed' });
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionState: 'active',
        currentPeriodEnd: new Date(mandate.current_end * 1000),
      }),
    );
  });
  it('does not mistake mandate activation for paid renewal', async () => {
    row.status = 'confirmed';
    mandate.status = 'active';
    mandate.current_end = end.getTime() / 1000 + 30 * 86400;
    mocks.invoices.mockResolvedValue([]);
    await reconcileReplacement('org', end);
    expect(mocks.update).not.toHaveBeenCalledWith(row.id, { status: 'completed' });
    expect(mocks.apply).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ subscriptionState: 'grace' }),
    );
  });
  it('refunds a late abandoned order without granting access', async () => {
    row.status = 'failed';
    await refundAbandonedReplacement(row);
    expect(mocks.refund).toHaveBeenCalledWith(payment.id, row.amount, row.id);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('refunds only renewals collected by the superseded mandate after the boundary', async () => {
    row.status = 'confirmed';
    row.sourceStoppedAt = now;
    mocks.invoices.mockResolvedValue([
      {
        subscription_id: 'old',
        status: 'paid',
        payment_id: 'pay_previous',
        billing_start: now.getTime() / 1000,
      },
      {
        subscription_id: 'old',
        status: 'paid',
        payment_id: 'pay_duplicate',
        billing_start: end.getTime() / 1000,
      },
    ]);
    mocks.payment.mockResolvedValue({ ...payment, id: 'pay_duplicate' });
    await auditSupersededAgreement(row);
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith('pay_duplicate', payment.amount, row.id);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('captures an exact authorized adjustment before fulfillment', async () => {
    mocks.payments.mockResolvedValue([{ ...payment, status: 'authorized' }]);
    mocks.capture.mockResolvedValue(payment);
    await reconcileReplacement('org', now);
    expect(mocks.capture).toHaveBeenCalledWith('pay_upgrade', 250000, 'INR');
    expect(mocks.apply).toHaveBeenCalled();
  });
  it('grants an immediate paid upgrade only after captured adjustment and old renewal cancellation', async () => {
    await reconcileReplacement('org', now);
    expect(mocks.cancel).toHaveBeenCalledWith('old', true);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        planTier: 'corporate',
        razorpaySubscriptionId: 'new',
        currentPeriodEnd: end,
        subscriptionState: 'active',
      }),
    );
    expect(mocks.operation).toHaveBeenCalledWith(expect.anything(), 'activated');
  });
  it.each(['authorized', 'failed'])('does not fulfill a %s adjustment', async (status) => {
    mocks.payments.mockResolvedValue([{ ...payment, status }]);
    await reconcileReplacement('org', now);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('rejects a captured payment for a different order or amount', async () => {
    mocks.payments.mockResolvedValue([
      { ...payment, order_id: 'other' },
      { ...payment, amount: 1 },
    ]);
    await reconcileReplacement('org', now);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('does not cancel the source before the replacement mandate is authorized', async () => {
    mandate.status = 'created';
    await reconcileReplacement('org', now);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
  it('retains Corporate until the scheduled paid downgrade boundary', async () => {
    row = {
      ...row,
      sourceTier: 'corporate',
      targetTier: 'professional_plus',
      amount: 0,
      orderId: null,
    };
    await reconcileReplacement('org', now);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planTier: 'corporate', subscriptionState: 'active' }),
    );
    expect(mocks.operation).toHaveBeenCalledWith(expect.anything(), 'scheduled');
  });
  it('switches directly to the lower paid tier at the boundary with bounded collection grace', async () => {
    row = {
      ...row,
      sourceTier: 'corporate',
      targetTier: 'professional_plus',
      amount: 0,
      orderId: null,
      status: 'confirmed',
    };
    await reconcileReplacement('org', end);
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        planTier: 'professional_plus',
        subscriptionState: 'grace',
        graceStartedAt: end,
        preLapseTier: 'professional_plus',
      }),
    );
  });
  it('does not reset an exhausted grace period', async () => {
    row.status = 'confirmed';
    mocks.local.mockResolvedValue({ razorpaySubscriptionId: 'new', subscriptionState: 'locked' });
    await reconcileReplacement('org', end);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('resumes an already scheduled cancellation without another cancellation request', async () => {
    source.cancel_at_cycle_end = true;
    await reconcileReplacement('org', now);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.apply).toHaveBeenCalled();
  });
  it('does not claim success while cancellation is uncertain', async () => {
    mocks.cancel.mockRejectedValue(new Error('timeout'));
    await expect(reconcileReplacement('org', now)).rejects.toThrow('timeout');
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('cancels an abandoned authenticated replacement without touching existing paid access', async () => {
    mocks.payments.mockResolvedValue([]);
    await reconcileReplacement('org', new Date(now.getTime() + 1000000));
    expect(mocks.cancel).toHaveBeenCalledWith('new', false);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith('operation', { status: 'failed' });
  });
  it('waits for provider expiry instead of treating a local timestamp as mandate cancellation', async () => {
    mandate.status = 'created';
    mocks.payments.mockResolvedValue([]);
    await reconcileReplacement('org', new Date(now.getTime() + 1000000));
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it('compensates when the source renewed while checkout was open', async () => {
    source.current_end += 30 * 86400;
    await reconcileReplacement('org', now);
    expect(mocks.update).toHaveBeenCalledWith('operation', { status: 'aborting' });
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('retains a durable creation reservation on an ambiguous provider timeout', async () => {
    mocks.create.mockRejectedValue(new Error('timeout'));
    await expect(createReplacement(row)).rejects.toThrow('timeout');
    expect(mocks.insert).toHaveBeenCalledBefore(mocks.create);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
describe('proration', () => {
  it('charges only the price difference for the remaining paid period', () => {
    expect(upgradeAmount(299900, 799900, 0, 30 * 86400, 15 * 86400)).toBe(250000);
  });
  it('uses actual cycle duration and never rounds above the quote', () => {
    expect(upgradeAmount(0, 100, 0, 3, 1)).toBe(66);
  });
  it('rejects invalid and expired periods', () => {
    expect(() => upgradeAmount(1, 2, 10, 10, 10)).toThrow();
    expect(() => upgradeAmount(1, 2, 0, 10, 10)).toThrow();
  });
});
