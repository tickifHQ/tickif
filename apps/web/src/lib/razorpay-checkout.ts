import type { PlanTier } from '@repo/contracts';
import { PLAN_MAP } from './plan-config';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, string>) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.head.appendChild(script);
  });
}

export async function openRazorpayCheckout(params: {
  keyId: string;
  subscriptionId: string;
  targetTier: PlanTier;
  changePaymentMethod?: boolean;
  prefill: { name: string | null; email: string | null; contact: string | null };
  onSuccess: (data: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss: () => void;
}): Promise<void> {
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout not available');
  }

  // Build prefill from the user's actual Tickif profile data.
  // Only include fields that have values — Razorpay handles missing fields gracefully.
  const prefill: Record<string, string> = {};
  if (params.prefill.name) prefill.name = params.prefill.name;
  if (params.prefill.email) prefill.email = params.prefill.email;
  if (params.prefill.contact) prefill.contact = params.prefill.contact;

  const rzp = new window.Razorpay({
    key: params.keyId,
    subscription_id: params.subscriptionId,
    name: 'Tickif',
    ...(params.changePaymentMethod ? { subscription_card_change: true } : {}),
    description: `Subscribe to ${PLAN_MAP[params.targetTier]?.label ?? params.targetTier}`,
    ...(Object.keys(prefill).length > 0 ? { prefill } : {}),
    handler: (response: Record<string, string>) => {
      params.onSuccess({
        razorpay_payment_id: response.razorpay_payment_id ?? '',
        razorpay_subscription_id: response.razorpay_subscription_id ?? '',
        razorpay_signature: response.razorpay_signature ?? '',
      });
    },
    modal: {
      ondismiss: () => {
        params.onDismiss();
      },
    },
    theme: {
      color: '#FF8F73',
    },
  });

  rzp.open();
}
