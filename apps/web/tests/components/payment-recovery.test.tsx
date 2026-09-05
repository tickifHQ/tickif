import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePaymentMethod } from '../../src/components/subscribe/use-payment-method';
import { PaymentHistory } from '../../src/components/payment-history';

const mocks = vi.hoisted(() => ({
  method: vi.fn(),
  verify: vi.fn(),
  checkout: vi.fn(),
  history: vi.fn(),
  change: vi.fn(),
}));
vi.mock('@/lib/razorpay-checkout', () => ({ openRazorpayCheckout: mocks.checkout }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      billing: {
        'payment-method': { $post: mocks.method },
        'verify-payment': { $post: mocks.verify },
        payments: { $get: mocks.history },
      },
    },
  },
}));
function Harness() {
  const payment = usePaymentMethod('corporate', mocks.change);
  return (
    <>
      <button onClick={payment.open} disabled={payment.busy}>
        Update Payment Method
      </button>
      <p>{payment.message}</p>
    </>
  );
}
describe('real payment controls', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.method.mockResolvedValue(
      Response.json({
        razorpaySubscriptionId: 'sub_existing',
        razorpayKeyId: 'rzp_test_public',
        shortUrl: null,
        prefill: {},
      }),
    );
    mocks.verify.mockResolvedValue(Response.json({ verified: true }));
    mocks.checkout.mockResolvedValue(undefined);
  });
  it('opens a card change against the existing subscription and blocks duplicate clicks', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.method).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub_existing', changePaymentMethod: true }),
    );
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it('keeps a failed signature from reporting recovery or refreshing entitlements', async () => {
    mocks.verify.mockResolvedValue(new Response(null, { status: 400 }));
    mocks.checkout.mockImplementation(async (options) =>
      options.onSuccess({
        razorpay_payment_id: 'pay_test',
        razorpay_subscription_id: 'sub_existing',
        razorpay_signature: 'bad',
      }),
    );
    render(<Harness />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Payment verification failed/)).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeEnabled();
  });
  it('verifies the provider callback and reconciles without claiming immediate activation', async () => {
    mocks.checkout.mockImplementation(async (options) =>
      options.onSuccess({
        razorpay_payment_id: 'pay_test',
        razorpay_subscription_id: 'sub_existing',
        razorpay_signature: 'signed',
      }),
    );
    render(<Harness />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Billing status updates after Razorpay confirms/)).toBeInTheDocument();
  });
  it('shows provider/script failures and permits a retry', async () => {
    mocks.checkout.mockRejectedValue(new Error('Failed to load Razorpay Checkout'));
    render(<Harness />);
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Failed to load Razorpay Checkout')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeEnabled();
  });
  it('renders paise as rupees and follows history pagination', async () => {
    mocks.history
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: 'pay_real',
              amount: 299900,
              currency: 'INR',
              status: 'captured',
              occurredAt: '2026-09-01T00:00:00.000Z',
            },
          ],
          nextOffset: 20,
        }),
      )
      .mockResolvedValueOnce(Response.json({ items: [], nextOffset: null }));
    render(<PaymentHistory />);
    expect(await screen.findByText('₹2,999.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next payments' }));
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith({ query: { offset: '20', limit: '20' } }),
    );
    expect(await screen.findByText('No payments recorded yet.')).toBeInTheDocument();
  });
  it('does not present a history failure as zero payments', async () => {
    mocks.history.mockRejectedValue(new Error('offline'));
    render(<PaymentHistory />);
    expect(await screen.findByText(/Payment history could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No payments recorded yet.')).not.toBeInTheDocument();
  });
});
