'use client';

import { useRef, useState } from 'react';
import type { PlanTier } from '@repo/contracts';
import { api } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';

/** Updating a mandate never grants access locally; refresh/webhooks confirm recovery. */
export function usePaymentMethod(tier: PlanTier, onChange: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  function finish() {
    inFlight.current = false;
    setBusy(false);
  }
  async function open() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await api.api.billing['payment-method'].$post({});
      if (!response.ok)
        throw new Error(
          'Unable to open payment recovery. Refresh billing and retry, or contact support if your subscription has ended.',
        );
      const data = await response.json();
      await openRazorpayCheckout({
        keyId: data.razorpayKeyId,
        subscriptionId: data.razorpaySubscriptionId,
        targetTier: tier,
        prefill: data.prefill,
        changePaymentMethod: true,
        onDismiss: () => {
          setMessage(
            'Payment update closed. Your subscription has not been changed by this checkout.',
          );
          finish();
        },
        onSuccess: async (payment) => {
          try {
            const verified = await api.api.billing['verify-payment'].$post({
              json: {
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySubscriptionId: payment.razorpay_subscription_id,
                razorpaySignature: payment.razorpay_signature,
              },
            });
            if (!verified.ok)
              throw new Error('Payment verification failed. Refresh billing before trying again.');
            setMessage(
              'Payment method verified. Billing status updates after Razorpay confirms it. Any older unpaid invoices may still require help from support.',
            );
            await onChange();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Unable to verify payment.');
          } finally {
            finish();
          }
        },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to open payment recovery.');
      finish();
    }
  }
  return {
    busy,
    message,
    open: () => {
      void open();
    },
  };
}
