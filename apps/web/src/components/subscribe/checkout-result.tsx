'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock3, Loader2, ArrowLeft, X, AlertTriangle } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import {
  billingSelectionContextSchema,
  subscriptionResponseSchema,
  type BillingSelectionContext,
  type SubscriptionResponse,
  type PlanTier,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { PLAN_MAP } from '@/lib/plan-config';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { CheckoutFlow } from './checkout-flow';
import { useBillingAutoRefresh } from './use-billing-auto-refresh';
import { getResumableCheckoutTier } from './use-selection-context';
import type { BillingSelectionScope } from './use-plan-selection';

interface CheckoutResultProps extends BillingSelectionScope {
  outcome: 'complete' | 'closed';
  targetTier: PlanTier;
}

/** Return URLs describe the checkout callback, never proof of payment or access. */
export function CheckoutResult(props: CheckoutResultProps) {
  return (
    <ScopedCheckoutResult
      key={JSON.stringify([props.userId, props.organizationId, props.targetTier, props.outcome])}
      {...props}
    />
  );
}

function ScopedCheckoutResult({ organizationId, targetTier, outcome }: CheckoutResultProps) {
  const [details, setDetails] = useState<{
    subscription: SubscriptionResponse;
    context: BillingSelectionContext;
  } | null>(null);
  const [error, setError] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [returnedOutcome, setReturnedOutcome] = useState(outcome);
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
      const [subscriptionResponse, contextResponse] = await Promise.all([
        api.api.billing.subscription.$get(),
        api.api.billing['selection-context'].$get(),
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
      setDetails({ subscription: subscription.data, context: context.data });
      setError(false);
    } catch (failure) {
      if (mounted.current) setError(true);
      throw failure;
    }
  }, [organizationId]);

  const context = details?.context;
  const subscription = details?.subscription;
  const known = !error && context?.providerState === 'known';
  // A fulfilled upgrade grants access now; its replacement renewal mandate starts next cycle.
  const confirmedReplacement = context?.actions.some(
    (action) =>
      action.targetTier === targetTier &&
      action.action === 'current' &&
      action.reason === 'replacement_pending',
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
    returnedOutcome === 'closed' &&
    known &&
    !active &&
    !scheduled &&
    (resumable || (!context.pendingOperation && !context.unfinishedCheckout));
  const refreshNow = useBillingAutoRefresh(refresh, {
    enabled: !active && !scheduled,
    urgent: !reviewOpen,
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

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <Link
        href="/designer/plan-billing"
        className="mb-12 inline-flex w-fit items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to billing
      </Link>
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
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {error
            ? 'We couldn’t check your payment status. We’ll try again automatically. Please wait before starting another payment.'
            : active
              ? `Your ${label} plan is now active.`
              : scheduled
                ? `Your ${label} plan starts on ${date}. Your current access continues until then.`
                : closed
                  ? resumable
                    ? `You closed Razorpay before checkout was confirmed. ${label} is still selected, and you can continue the same checkout whenever you’re ready.`
                    : 'This checkout is no longer pending. You can review the available plans to start a new checkout.'
                  : `We’re checking your ${label} payment. Your plan will update once it’s confirmed. No further payment is needed while we check.`}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:min-w-52">
          {closed && resumable && (
            <Button variant="fancy" onClick={() => setReviewOpen(true)}>
              Continue checkout
            </Button>
          )}
          {closed && !resumable && (
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
      {subscription && (
        <CheckoutFlow
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          currentTier={subscription.tier}
          lifecycleState={subscription.lifecycleState}
          cancellationScheduled={subscription.cancellationScheduled}
          currentPeriodEnd={subscription.currentPeriodEnd}
          initialTargetTier={targetTier}
          onSubscriptionChange={refreshNow}
          onCheckoutResult={(next) => {
            setReturnedOutcome(next);
            setReviewOpen(false);
            void refreshNow().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}
