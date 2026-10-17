'use client';

import { useRef, useState } from 'react';
import { billingCheckoutResponseSchema, errorResponseSchema, type PlanTier } from '@repo/contracts';
import { api } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';

/** Updating a mandate never grants access locally; refresh/webhooks confirm recovery. */
export function usePaymentMethod(tier: PlanTier, onChange: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [supportRecommended, setSupportRecommended] = useState(false);
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
    setSupportRecommended(false);
    try {
      const response = await api.api.billing['payment-method'].$post({});
      if (!response.ok) {
        setSupportRecommended(true);
        const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
        throw new Error(
          response.status < 500 && parsed.success
            ? parsed.data.error.message
            : 'Unable to open payment method update. Please try again or contact support.',
        );
      }
      const parsed = billingCheckoutResponseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error('Unable to verify payment update details. Please try again.');
      const data = parsed.data;
      await openRazorpayCheckout({
        keyId: data.razorpayKeyId,
        subscriptionId: data.razorpaySubscriptionId,
        targetTier: tier,
        prefill: data.prefill,
        changePaymentMethod: true,
        onDismiss: () => {
          setSupportRecommended(false);
          setMessage('Payment update closed. No payment method update was confirmed.');
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
              throw new Error('Payment verification failed. Billing status updates automatically.');
            setSupportRecommended(true);
            setMessage(
              'Payment method verified. Billing status updates after Razorpay confirms it. Older unpaid invoices may still require support.',
            );
            await onChange();
          } catch (error) {
            setSupportRecommended(false);
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
    supportRecommended,
    open: () => {
      void open();
    },
  };
}
