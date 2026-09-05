import { afterEach, describe, expect, it, vi } from 'vitest';

type CheckoutOptions = {
  handler: (response: Record<string, string>) => void;
  modal: { ondismiss: () => void };
};

function installRazorpay(capture: (options: CheckoutOptions) => void) {
  class RazorpayMock {
    constructor(options: Record<string, unknown>) {
      capture(options as CheckoutOptions);
    }
    open() {}
    on() {}
  }
  (window as unknown as { Razorpay: typeof RazorpayMock }).Razorpay = RazorpayMock;
}

const checkoutParams = {
  keyId: 'rzp_test_fixture',
  subscriptionId: 'sub_fixture',
  targetTier: 'professional_plus' as const,
  prefill: { name: null, email: null, contact: null },
};

describe('Razorpay Checkout lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    document.querySelectorAll('script[src*="checkout.razorpay.com"]').forEach((script) => {
      script.remove();
    });
    vi.resetModules();
  });

  it('settles only once when dismiss fires after a successful callback', async () => {
    let options: CheckoutOptions | undefined;
    installRazorpay((value) => {
      options = value;
    });
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const { openRazorpayCheckout } = await import('@/lib/razorpay-checkout');

    await openRazorpayCheckout({ ...checkoutParams, onSuccess, onDismiss });
    options!.handler({
      razorpay_payment_id: 'pay_fixture',
      razorpay_subscription_id: 'sub_fixture',
      razorpay_signature: 'signature',
    });
    options!.modal.ondismiss();

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('settles only once when a callback arrives after dismissal', async () => {
    let options: CheckoutOptions | undefined;
    installRazorpay((value) => {
      options = value;
    });
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const { openRazorpayCheckout } = await import('@/lib/razorpay-checkout');

    await openRazorpayCheckout({ ...checkoutParams, onSuccess, onDismiss });
    options!.modal.ondismiss();
    options!.handler({
      razorpay_payment_id: 'pay_fixture',
      razorpay_subscription_id: 'sub_fixture',
      razorpay_signature: 'signature',
    });

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent script loads', async () => {
    let script: HTMLScriptElement | undefined;
    const append = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      script = node as HTMLScriptElement;
      return node;
    });
    const { openRazorpayCheckout } = await import('@/lib/razorpay-checkout');
    const onSuccess = vi.fn();
    const onDismiss = vi.fn();
    const first = openRazorpayCheckout({ ...checkoutParams, onSuccess, onDismiss });
    const second = openRazorpayCheckout({ ...checkoutParams, onSuccess, onDismiss });
    expect(append).toHaveBeenCalledOnce();
    expect(script?.src).toBe('https://checkout.razorpay.com/v1/checkout.js');

    installRazorpay(() => {});
    script!.dispatchEvent(new Event('load'));
    await Promise.all([first, second]);
  });
});
