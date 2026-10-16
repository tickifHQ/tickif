import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  locked: vi.fn(),
  subscription: vi.fn(),
  cancel: vi.fn(),
  invoices: vi.fn(),
  payment: vi.fn(),
  refund: vi.fn(),
  recordPayment: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('../src/abandoned-repository.js', () => ({ abandonedCheckoutRepository: mocks }));
vi.mock('../src/provider.js', () => ({ replacementProvider: mocks }));
import { reconcileAbandonedCheckout } from '../src/abandoned-service.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.locked.mockImplementation(async (_id: string, work: (value: unknown) => Promise<unknown>) =>
    work({
      row: { organizationId: 'org', razorpaySubscriptionId: 'sub_abandoned' },
      currentSubscriptionId: 'sub_current',
      recordPayment: mocks.recordPayment,
      resolve: mocks.resolve,
    }),
  );
  mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'created' });
  mocks.cancel.mockResolvedValue({ id: 'sub_abandoned', status: 'cancelled' });
  mocks.invoices.mockResolvedValue([]);
});

describe('superseded checkout compensation', () => {
  it('retains a created mandate without attempting unsupported cancellation', async () => {
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.invoices).toHaveBeenCalledWith('sub_abandoned');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('cancels a superseded mandate if it is authorized after the customer leaves', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'authenticated' });
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.cancel).toHaveBeenCalledWith('sub_abandoned', false);
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });

  it('refunds late captured invoices even after the old mandate is cancelled', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'cancelled' });
    mocks.invoices.mockResolvedValue([
      { subscription_id: 'sub_abandoned', status: 'paid', payment_id: 'pay_late' },
      { subscription_id: 'sub_current', status: 'paid', payment_id: 'pay_current' },
    ]);
    mocks.payment
      .mockResolvedValueOnce({
        id: 'pay_late',
        status: 'captured',
        amount: 20000,
        amount_refunded: 0,
      })
      .mockResolvedValueOnce({
        id: 'pay_late',
        status: 'captured',
        amount: 20000,
        amount_refunded: 20000,
      });
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith('pay_late', 20000, 'sub_abandoned');
    expect(mocks.payment).toHaveBeenCalledTimes(2);
    expect(mocks.recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount_refunded: 20000 }),
    );
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });

  it('never cancels or refunds an agreement still used by the current plan', async () => {
    mocks.locked.mockImplementation(
      async (_id: string, work: (value: unknown) => Promise<unknown>) =>
        work({
          row: { organizationId: 'org', razorpaySubscriptionId: 'sub_abandoned' },
          currentSubscriptionId: 'sub_abandoned',
          recordPayment: mocks.recordPayment,
          resolve: mocks.resolve,
        }),
    );
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('does not refund an authorized payment or refund a fully refunded capture twice', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'cancelled' });
    mocks.invoices.mockResolvedValue([
      { subscription_id: 'sub_abandoned', status: 'paid', payment_id: 'pay_pending' },
      { subscription_id: 'sub_abandoned', status: 'paid', payment_id: 'pay_refunded' },
    ]);
    mocks.payment.mockImplementation(async (id: string) => ({
      id,
      status: id === 'pay_pending' ? 'authorized' : 'captured',
      amount: 20000,
      amount_refunded: id === 'pay_refunded' ? 20000 : 0,
    }));
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('keeps a pending refund unresolved until provider payment confirms the full amount', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'cancelled' });
    mocks.invoices.mockResolvedValue([
      { subscription_id: 'sub_abandoned', status: 'paid', payment_id: 'pay_partial' },
    ]);
    mocks.payment.mockResolvedValue({
      id: 'pay_partial',
      status: 'captured',
      amount: 20000,
      amount_refunded: 5000,
    });
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.refund).toHaveBeenCalledWith('pay_partial', 20000, 'sub_abandoned');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('keeps the attempt unresolved when cancellation fails so a later worker can retry', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'active' });
    mocks.cancel.mockRejectedValue(new Error('provider unavailable'));
    await expect(reconcileAbandonedCheckout('sub_abandoned')).rejects.toThrow(
      'provider unavailable',
    );
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('does not skip an authorized payment on an issued invoice', async () => {
    mocks.subscription.mockResolvedValue({ id: 'sub_abandoned', status: 'cancelled' });
    mocks.invoices.mockResolvedValue([
      { subscription_id: 'sub_abandoned', status: 'issued', payment_id: 'pay_authorized' },
    ]);
    mocks.payment.mockResolvedValue({
      id: 'pay_authorized',
      status: 'authorized',
      amount: 20000,
      amount_refunded: 0,
    });
    await reconcileAbandonedCheckout('sub_abandoned');
    expect(mocks.recordPayment).toHaveBeenCalledOnce();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
