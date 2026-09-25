'use client';

import { useState } from 'react';
import { billingReplacementCheckoutSchema, type BillingReplacementVerify } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { api } from '@/lib/api';
import { openRazorpayCheckout, openRazorpayOrder } from '@/lib/razorpay-checkout';
import { useBillingAutoRefresh } from './use-billing-auto-refresh';

/** Each provider callback is verified; reloading resumes the same mandate and order. */
export function ReplacementCheckout({
  onChange,
  onProviderOpen,
}: {
  onChange: () => void;
  onProviderOpen: (open: boolean) => void;
}) {
  const [checkout, setCheckout] =
    useState<ReturnType<typeof billingReplacementCheckoutSchema.parse>>(null);
  const [message, setMessage] = useState('Loading your plan change…');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const response = await api.api.billing.replacement.$get();
    if (!response.ok) throw new Error('Unable to confirm your plan change. Please try again.');
    const next = billingReplacementCheckoutSchema.parse(await response.json());
    setCheckout(next);
    setMessage(
      !next
        ? 'No pending checkout. Refresh billing to see your current plan.'
        : next.status === 'confirmed'
          ? 'Your plan change is confirmed.'
          : next.status === 'creating'
            ? 'We are checking whether your checkout was created. Please do not start another payment. Contact support if this remains pending.'
            : next.status === 'aborting'
              ? 'This checkout could not complete. We are cancelling the new mandate and refunding any upgrade payment. Your original plan remains in place.'
              : 'Authorize future renewals, then pay any upgrade adjustment. Your existing access continues while checkout is pending.',
    );
    if (!next || next.status === 'confirmed') onChange();
    return next;
  }
  useBillingAutoRefresh(
    async () => {
      try {
        await refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load checkout.');
        throw error;
      }
    },
    { enabled: !busy, urgent: true },
  );
  async function verify(input: BillingReplacementVerify) {
    const response = await api.api.billing.replacement.verify.$post({ json: input });
    if (!response.ok)
      throw new Error('Payment confirmation is pending. Check status before trying again.');
    await refresh();
  }
  async function pay() {
    if (!checkout?.razorpaySubscriptionId) return;
    setBusy(true);
    onProviderOpen(true);
    try {
      if (!checkout.mandateAuthorized)
        await new Promise<void>((resolve, reject) => {
          void openRazorpayCheckout({
            keyId: checkout.razorpayKeyId,
            subscriptionId: checkout.razorpaySubscriptionId!,
            targetTier: checkout.targetTier,
            prefill: { name: null, email: null, contact: null },
            onDismiss: () => reject(new Error('Checkout closed. You can resume this plan change.')),
            onSuccess: (payment) => {
              void verify({
                operationId: checkout.operationId,
                kind: 'subscription',
                providerId: payment.razorpay_subscription_id,
                paymentId: payment.razorpay_payment_id,
                signature: payment.razorpay_signature,
              }).then(resolve, reject);
            },
          }).catch(reject);
        });
      const next = await refresh();
      if (next?.status === 'checkout' && next.razorpayOrderId && next.amount > 0) {
        await new Promise<void>((resolve, reject) => {
          void openRazorpayOrder({
            keyId: next.razorpayKeyId,
            orderId: next.razorpayOrderId!,
            amount: next.amount,
            currency: next.currency,
            onDismiss: () =>
              reject(
                new Error(
                  'Payment closed. Your upgrade is pending; resume before the quote expires.',
                ),
              ),
            onSuccess: (payment) => {
              void verify({
                operationId: next.operationId,
                kind: 'order',
                providerId: payment.razorpay_order_id,
                paymentId: payment.razorpay_payment_id,
                signature: payment.razorpay_signature,
              }).then(resolve, reject);
            },
          }).catch(reject);
        });
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Checkout is pending.');
    } finally {
      setBusy(false);
      onProviderOpen(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p role="status">{message}</p>
      {checkout?.status === 'checkout' && (
        <Button disabled={busy} onClick={() => void pay()}>
          {busy ? 'Checkout in progress…' : 'Continue plan change'}
        </Button>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          void refresh().catch(() => setMessage('Confirmation is temporarily unavailable.'))
        }
      >
        Check status
      </Button>
    </div>
  );
}
