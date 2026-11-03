'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Clock3, Loader2, ArrowLeft, X, AlertTriangle } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import {
  billingPaymentsResponseSchema,
  billingSelectionContextSchema,
  subscriptionResponseSchema,
  type BillingPaymentsResponse,
  type BillingSelectionContext,
  type SubscriptionResponse,
  type PlanTier,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { PLAN_MAP } from '@/lib/plan-config';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { useBillingAutoRefresh } from './use-billing-auto-refresh';
import { getResumableCheckoutTier } from './use-selection-context';
import type { BillingSelectionScope } from './use-plan-selection';
import { useWorkspaceEntitlementSync } from '@/components/workspace-entitlement-sync';
import { useCheckoutPayment } from './checkout-payment';
import { CheckoutPrinter, type CheckoutPrinterState } from './checkout-receipt';

interface CheckoutResultProps extends BillingSelectionScope {
  outcome: 'complete' | 'closed';
  targetTier: PlanTier;
  studioName: string | null;
}

type RecordedPayment = BillingPaymentsResponse['items'][number];

const RECEIPT_CONFIRMATION_TIMEOUT_MS = 30_000;

/** Return URLs describe the checkout callback, never proof of payment or access. */
export function CheckoutResult(props: CheckoutResultProps) {
  return (
    <ScopedCheckoutResult
      key={JSON.stringify([props.userId, props.organizationId, props.targetTier, props.outcome])}
      {...props}
    />
  );
}

function ScopedCheckoutResult({
  organizationId,
  targetTier,
  outcome,
  studioName,
}: CheckoutResultProps) {
  const synchronizeWorkspace = useWorkspaceEntitlementSync();
  // Only a payment made from this tab prints a receipt; every other return keeps the
  // plain status below.
  const rememberedPaymentId = useCheckoutPayment(targetTier);
  const receiptPaymentId = outcome === 'complete' ? rememberedPaymentId : null;
  const [details, setDetails] = useState<{
    subscription: SubscriptionResponse;
    context: BillingSelectionContext;
    payment: RecordedPayment | null;
  } | null>(null);
  const [error, setError] = useState(false);
  const [receiptTimedOut, setReceiptTimedOut] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    try {
      const refreshed = await api.api.billing.subscription.refresh.$get();
      if (!refreshed.ok) throw new Error('Billing unavailable');
      const [subscriptionResponse, contextResponse, payment] = await Promise.all([
        api.api.billing.subscription.$get(),
        api.api.billing['selection-context'].$get(),
        receiptPaymentId ? findCapturedPayment(receiptPaymentId) : null,
      ]);
      if (!subscriptionResponse.ok || !contextResponse.ok) throw new Error('Billing unavailable');
      const [subscriptionJson, contextJson] = await Promise.all([
        subscriptionResponse.json(),
        contextResponse.json(),
      ]);
      const subscription = subscriptionResponseSchema.safeParse(subscriptionJson);
      const context = billingSelectionContextSchema.safeParse(contextJson);
      if (
        !subscription.success ||
        !context.success ||
        context.data.organizationId !== organizationId
      )
        throw new Error('Billing could not be verified');
      if (!mounted.current) return;
      setDetails({ subscription: subscription.data, context: context.data, payment });
      synchronizeWorkspace(organizationId, subscription.data);
      setError(false);
    } catch (failure) {
      if (mounted.current) setError(true);
      throw failure;
    }
  }, [organizationId, receiptPaymentId, synchronizeWorkspace]);

  const context = details?.context;
  const subscription = details?.subscription;
  const known = !error && context?.providerState === 'known';
  // A fulfilled upgrade grants access now; its replacement renewal mandate starts next cycle.
  const confirmedReplacement = context?.actions.some(
    (action) =>
      action.targetTier === targetTier &&
      action.action === 'current' &&
      (action.reason === 'renewal_pending' || action.reason === 'replacement_pending'),
  );
  const active =
    known &&
    !context.pendingOperation &&
    !context.unfinishedCheckout &&
    context.currentTier === targetTier &&
    subscription?.tier === targetTier &&
    subscription.lifecycleState === 'active' &&
    (subscription.razorpayStatus === 'active' ||
      (subscription.razorpayStatus === 'authenticated' && confirmedReplacement));
  const scheduled = known && context.scheduledChange?.targetTier === targetTier;
  const resumable = known && getResumableCheckoutTier(context) === targetTier;
  const closed =
    outcome === 'closed' &&
    known &&
    !active &&
    !scheduled &&
    (resumable || (!context.pendingOperation && !context.unfinishedCheckout));
  // The receipt waits for both: the plan active in our database and the payment
  // captured by the webhook. The provider's client callback alone never prints it.
  const receiptPayment = active && details?.payment ? details.payment : null;
  const printerState: CheckoutPrinterState | null = !receiptPaymentId
    ? null
    : receiptTimedOut
      ? { status: 'timed-out' }
      : receiptPayment && subscription
        ? {
            status: 'confirmed',
            receipt: {
              planLabel: PLAN_MAP[targetTier].label,
              payment: {
                id: receiptPayment.id,
                amount: receiptPayment.amount,
                currency: receiptPayment.currency,
                paidAt: receiptPayment.occurredAt,
              },
              studioName,
              subscriptionId: subscription.razorpaySubscriptionId ?? null,
              renewsAt: subscription.currentPeriodEnd,
            },
          }
        : { status: 'processing' };
  const awaitingReceipt = printerState?.status === 'processing';
  useEffect(() => {
    if (!awaitingReceipt) return;
    const timer = setTimeout(() => setReceiptTimedOut(true), RECEIPT_CONFIRMATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingReceipt]);
  const refreshNow = useBillingAutoRefresh(refresh, {
    enabled: (!active && !scheduled) || awaitingReceipt,
    urgent: true,
  });
  const label = PLAN_MAP[targetTier].label;
  const title = error
    ? 'Unable to confirm payment'
    : active
      ? 'Payment confirmed'
      : scheduled
        ? 'Plan change scheduled'
        : closed
          ? 'Checkout closed'
          : 'Confirming your payment';
  const Icon = error ? AlertTriangle : active ? Check : scheduled ? Clock3 : closed ? X : Loader2;
  const effectiveAt = context?.scheduledChange?.effectiveAt;
  const date = effectiveAt
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(effectiveAt))
    : 'the confirmed renewal date';

  if (printerState)
    return (
      <CheckoutResultFrame>
        <div className="mx-auto w-full py-4">
          <CheckoutPrinter state={printerState} planLabel={label} />
        </div>
      </CheckoutResultFrame>
    );

  return (
    <CheckoutResultFrame>
      <div
        className="mx-auto my-auto flex w-full max-w-md flex-col items-center py-12 text-center"
        role="status"
        aria-live="polite"
      >
        <div
          className={`mb-6 flex size-16 items-center justify-center rounded-full ${error ? 'bg-destructive/10 text-destructive' : closed ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}
        >
          <Icon
            className={`size-7 ${!error && !active && !scheduled && !closed ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <h1 className="font-sans text-2xl font-medium tracking-normal">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {error
            ? 'We couldn’t check your payment status. We’ll try again automatically. Please wait before starting another payment.'
            : active
              ? `Your ${label} plan is now active.`
              : scheduled
                ? `Your ${label} plan starts on ${date}. Your current access continues until then.`
                : closed
                  ? 'You can review the available plans and choose again. Your access changes only after payment is confirmed.'
                  : `We’re checking your ${label} payment. Your plan will update once it’s confirmed. No further payment is needed while we check.`}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:min-w-52">
          {closed && (
            <Button variant="fancy" asChild>
              <Link href="/designer/plan-billing/subscribe">Choose your plan</Link>
            </Button>
          )}
          {(active || scheduled) && (
            <Button variant="fancy" asChild>
              <Link href="/designer/plan-billing">Go to billing</Link>
            </Button>
          )}
          {error && (
            <Button variant="fancy" onClick={() => void refreshNow().catch(() => undefined)}>
              Check payment status
            </Button>
          )}
          {!active && !scheduled && (
            <Button variant="outline" asChild>
              <Link href="/designer/plan-billing">Back to billing</Link>
            </Button>
          )}
        </div>
        {!active && !scheduled && !closed && (
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            This page updates automatically. You can return to billing while we confirm your
            payment.
          </p>
        )}
        {error && (
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-sm text-primary underline underline-offset-4"
          >
            Contact support
          </a>
        )}
      </div>
    </CheckoutResultFrame>
  );
}

function CheckoutResultFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <Link
        href="/designer/plan-billing"
        className="mb-12 inline-flex w-fit items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to billing
      </Link>
      {children}
    </div>
  );
}

async function findCapturedPayment(paymentId: string): Promise<RecordedPayment | null> {
  const response = await api.api.billing.payments.$get({ query: { limit: '20' } });
  if (!response.ok) throw new Error('Billing unavailable');
  const payments = billingPaymentsResponseSchema.safeParse(await response.json());
  if (!payments.success) throw new Error('Billing could not be verified');
  return (
    payments.data.items.find(
      (payment) => payment.id === paymentId && payment.status === 'captured',
    ) ?? null
  );
}
