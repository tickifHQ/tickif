import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  verify: vi.fn(),
  mandate: vi.fn(),
  order: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: { api: { billing: { replacement: { $get: mocks.get, verify: { $post: mocks.verify } } } } },
}));
vi.mock('@/lib/razorpay-checkout', () => ({
  openRazorpayCheckout: mocks.mandate,
  openRazorpayOrder: mocks.order,
}));
import { ReplacementCheckout } from '../../src/components/subscribe/replacement-checkout';
import type { openRazorpayCheckout, openRazorpayOrder } from '../../src/lib/razorpay-checkout';
const checkout = {
  operationId: 'f9722d1a-343d-42b0-961e-78c72e54839c',
  status: 'checkout',
  targetTier: 'corporate',
  mandateAuthorized: true,
  razorpaySubscriptionId: 'sub_next',
  razorpayOrderId: 'order_upgrade',
  amount: 250000,
  currency: 'INR',
  effectiveAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  razorpayKeyId: 'test_key',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ ok: true, json: async () => checkout });
  mocks.verify.mockResolvedValue({ ok: true });
});
describe('replacement checkout', () => {
  it('verifies both checkout callbacks before reporting a confirmed upgrade', async () => {
    let next = { ...checkout, mandateAuthorized: false };
    const changed = vi.fn();
    const providerOpen = vi.fn();
    mocks.get.mockImplementation(async () => ({ ok: true, json: async () => next }));
    mocks.mandate.mockImplementation(
      async (options: Parameters<typeof openRazorpayCheckout>[0]) => {
        next = { ...next, mandateAuthorized: true };
        options.onSuccess({
          razorpay_subscription_id: 'sub_next',
          razorpay_payment_id: 'pay_auth',
          razorpay_signature: 'mandate-signature',
        });
      },
    );
    mocks.order.mockImplementation(async (options: Parameters<typeof openRazorpayOrder>[0]) => {
      expect(changed).not.toHaveBeenCalled();
      next = { ...next, status: 'confirmed' };
      options.onSuccess({
        razorpay_order_id: 'order_upgrade',
        razorpay_payment_id: 'pay_upgrade',
        razorpay_signature: 'order-signature',
      });
    });
    render(<ReplacementCheckout onChange={changed} onProviderOpen={providerOpen} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue plan change' }));
    await waitFor(() => expect(providerOpen).toHaveBeenLastCalledWith(false));
    expect(mocks.verify).toHaveBeenNthCalledWith(1, {
      json: {
        operationId: checkout.operationId,
        kind: 'subscription',
        providerId: 'sub_next',
        paymentId: 'pay_auth',
        signature: 'mandate-signature',
      },
    });
    expect(mocks.verify).toHaveBeenNthCalledWith(2, {
      json: {
        operationId: checkout.operationId,
        kind: 'order',
        providerId: 'order_upgrade',
        paymentId: 'pay_upgrade',
        signature: 'order-signature',
      },
    });
    expect(changed).toHaveBeenCalled();
  });
  it('resumes the existing order without reauthorizing an authenticated mandate', async () => {
    render(<ReplacementCheckout onChange={vi.fn()} onProviderOpen={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue plan change' }));
    await waitFor(() =>
      expect(mocks.order).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order_upgrade', amount: 250000 }),
      ),
    );
    expect(mocks.mandate).not.toHaveBeenCalled();
  });
  it('obtains mandate authorization before opening an upgrade payment', async () => {
    mocks.get.mockResolvedValue({
      ok: true,
      json: async () => ({ ...checkout, mandateAuthorized: false }),
    });
    render(<ReplacementCheckout onChange={vi.fn()} onProviderOpen={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue plan change' }));
    await waitFor(() => expect(mocks.mandate).toHaveBeenCalled());
    expect(mocks.order).not.toHaveBeenCalled();
  });
  it('does not call an absent or failed checkout a successful plan change', async () => {
    mocks.get.mockResolvedValue({ ok: true, json: async () => null });
    render(<ReplacementCheckout onChange={vi.fn()} onProviderOpen={vi.fn()} />);
    expect(await screen.findByText(/No pending checkout/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue plan change' })).not.toBeInTheDocument();
  });
});
