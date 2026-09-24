import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  current: vi.fn(),
  reconcile: vi.fn(),
  subscription: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('@repo/config', () => ({
  config: { RAZORPAY_KEY_SECRET: 'test-secret', RAZORPAY_KEY_ID: 'test-key' },
}));
vi.mock('@repo/billing', () => ({
  replacementRepository: { current: mocks.current },
  reconcileReplacement: mocks.reconcile,
  replacementProvider: { subscription: mocks.subscription },
  createReplacement: vi.fn(),
}));
vi.mock('../../../src/modules/billing/selection-service.js', () => ({
  assertBillingAccess: mocks.access,
}));
vi.mock('../../../src/lib/redis.js', () => ({ invalidateEntitlementCache: mocks.invalidate }));
vi.mock('../../../src/modules/billing/razorpay-client.js', () => ({
  resolveRazorpayPlanId: vi.fn(),
}));
import { verifyReplacement } from '../../../src/modules/billing/replacement-service.js';
const caller = { userId: 'owner', activeOrgId: 'org' };
const row = {
  id: 'operation',
  replacementSubscriptionId: 'sub_next',
  orderId: 'order_next',
  periodEnd: new Date(),
  expiresAt: new Date(),
};
const signature = (message: string) =>
  createHmac('sha256', 'test-secret').update(message).digest('hex');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.current.mockResolvedValue(row);
  mocks.subscription.mockResolvedValue({ status: 'authenticated' });
});
describe('replacement callback verification', () => {
  it.each(['order', 'subscription'] as const)(
    'verifies the %s signature and rechecks provider state',
    async (kind) => {
      const providerId = kind === 'order' ? 'order_next' : 'sub_next';
      const message = kind === 'order' ? `${providerId}|pay_next` : `pay_next|${providerId}`;
      await verifyReplacement(caller, {
        operationId: row.id,
        kind,
        providerId,
        paymentId: 'pay_next',
        signature: signature(message),
      });
      expect(mocks.access).toHaveBeenCalledWith(caller);
      expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('org');
    },
  );
  it('rejects callbacks before touching a provider when billing access is denied', async () => {
    mocks.access.mockRejectedValue(new Error('Forbidden'));
    await expect(
      verifyReplacement(caller, {
        operationId: row.id,
        kind: 'order',
        providerId: 'order_next',
        paymentId: 'pay_next',
        signature: signature('order_next|pay_next'),
      }),
    ).rejects.toThrow('Forbidden');
    expect(mocks.current).not.toHaveBeenCalled();
  });
  it.each([
    {
      operationId: 'another-organization',
      providerId: 'order_next',
      signature: signature('order_next|pay_next'),
    },
    {
      operationId: row.id,
      providerId: 'other_order',
      signature: signature('other_order|pay_next'),
    },
    { operationId: row.id, providerId: 'order_next', signature: 'bad-signature' },
    { operationId: row.id, providerId: 'order_next', signature: signature('pay_next|order_next') },
  ])('rejects an unbound or invalid callback: $providerId / $operationId', async (input) => {
    await expect(
      verifyReplacement(caller, { ...input, kind: 'order', paymentId: 'pay_next' }),
    ).rejects.toThrow();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
