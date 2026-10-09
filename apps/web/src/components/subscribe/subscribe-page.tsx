'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Button } from '@repo/ui/components/button';
import { BillingStatusNotice } from '@/components/subscribe/saved-recovery-notice';
import { PlanSelection } from './plan-selection';
import { usePlanSelection, type BillingSelectionScope } from './use-plan-selection';
import { useSelectionContext } from './use-selection-context';
import { useBillingAutoRefresh } from './use-billing-auto-refresh';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import type { SubscriptionState, SubscriptionResponse } from '@repo/contracts';
import { subscriptionResponseSchema } from '@repo/contracts';
import { PLAN_MAP } from '@/lib/plan-config';
import { CheckoutFlow } from './checkout-flow';
import { api } from '@/lib/api';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { usePaymentMethod } from './use-payment-method';
import { EarlyBirdActive } from '@/components/early-bird-trial';

/**
 * E-120 Subscribe page client component.
 *
 * Fetches current subscription from E-119 (GET /api/billing/subscription),
 * then renders the plan selection + checkout flow.
 *
 * Lifecycle handling:
 * - active: normal upgrade flow available
 * - payment_failed: show warning, allow plan changes
 * - grace: show warning with days remaining
 * - locked: disable upgrade, show suspension notice
 * - downgraded: show reactivation notice
 *
 * Does NOT duplicate the Plan & Billing lifecycle detail UI (E-179).
 * Links to /designer/plan-billing for lifecycle management.
 */
export function SubscribePage(props: BillingSelectionScope) {
  return (
    <ScopedSubscribePage key={JSON.stringify([props.userId, props.organizationId])} {...props} />
  );
}

function ScopedSubscribePage({ userId, organizationId }: BillingSelectionScope) {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { selectedTier, setSelectedTier } = usePlanSelection({
    userId,
    organizationId,
    currentTier: subscription?.tier ?? null,
  });
  const selection = useSelectionContext(organizationId);

  const fetchSubscription = useCallback(async () => {
    try {
      const refresh = await api.api.billing.subscription.refresh.$get();
      if (!refresh.ok) throw new Error('We could not update your billing details');
      const response = await api.api.billing.subscription.$get();
      if (!response.ok) {
        throw new Error('We could not load your subscription');
      }
      const parsed = subscriptionResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('We could not verify your subscription');
      setSubscription(parsed.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      await fetchSubscription();
    } finally {
      await selection.refreshContext();
    }
  }, [fetchSubscription, selection.refreshContext]);
  const refreshNow = useBillingAutoRefresh(refreshAll, {
    urgent:
      !dialogOpen &&
      !!(
        error ||
        selection.error ||
        selection.context?.pendingOperation ||
        selection.context?.unfinishedCheckout ||
        selection.context?.recovery?.status === 'requested' ||
        selection.context?.recovery?.status === 'checkout_pending'
      ),
  });
  const payment = usePaymentMethod(subscription?.tier ?? 'hobby', refreshNow);

  // Keep the mounted checkout and its provider callbacks alive during background refreshes.
  if (loading && !subscription) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="mt-3 text-sm text-muted-foreground">
          {error ?? 'Unable to load subscription'}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">We will try again automatically.</p>
      </div>
    );
  }

  const { tier, lifecycleState } = subscription;
  if (subscription.earlyBirdTrial)
    return (
      <div className="p-8">
        <EarlyBirdActive trial={subscription.earlyBirdTrial} />
      </div>
    );
  const suppressPlanActions =
    !selection.context || Object.values(selection.actions).some((action) => action?.hidden);
  const needsPaymentRecovery =
    subscription.razorpayStatus === 'halted' ||
    lifecycleState === 'payment_failed' ||
    lifecycleState === 'grace';

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <Link
        href="/designer/plan-billing"
        className="mb-6 inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to billing
      </Link>
      {loading && (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          Refreshing billing status…
        </p>
      )}
      {error && (
        <div className="mb-4 flex flex-col gap-2" role="alert">
          <p>
            {error}. Previously loaded billing details are shown. We will try again automatically.
          </p>
        </div>
      )}
      {lifecycleState !== 'active' && (
        <div className="mb-6">
          <LifecycleNotice state={lifecycleState} />
        </div>
      )}

      <BillingStatusNotice
        context={selection.context}
        currentTier={tier}
        cancellationScheduled={subscription.cancellationScheduled}
        currentPeriodEnd={subscription.currentPeriodEnd}
        onDismissed={refreshNow}
        onReview={(target) => {
          setSelectedTier(target);
          setDialogOpen(true);
        }}
      />

      <PlanSelection
        headingLevel={1}
        description="Compare plans and manage your subscription"
        currentTier={tier}
        lifecycleState={lifecycleState}
        selectedTier={selection.savedTargetTier ?? selectedTier}
        actions={selection.actions}
        onSelectPlan={(target) => {
          setSelectedTier(target);
          setDialogOpen(true);
        }}
      />
      {selectedTier && !suppressPlanActions && !selection.actions[selectedTier]?.disabled && (
        <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
          Continue {PLAN_MAP[selectedTier].label}
        </Button>
      )}
      {selection.error && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {selection.error}
        </p>
      )}

      {/* Payment recovery remains separate from plan selection. */}
      {needsPaymentRecovery && (
        <Button variant="fancy" className="mt-4" onClick={payment.open} disabled={payment.busy}>
          Update Payment Method
        </Button>
      )}
      {payment.message && (
        <p role="status" className="mt-3 text-sm">
          {payment.message}
          {payment.supportRecommended ? (
            <>
              {' '}
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Contact support
              </a>
              .
            </>
          ) : null}
        </p>
      )}

      {/* Checkout dialog */}
      <CheckoutFlow
        scopeKey={JSON.stringify([userId, organizationId])}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentTier={tier}
        lifecycleState={lifecycleState}
        cancellationScheduled={subscription.cancellationScheduled ?? false}
        currentPeriodEnd={subscription.currentPeriodEnd}
        restoreTier={subscription.preLapseTier}
        initialTargetTier={selectedTier}
        onTargetChange={setSelectedTier}
        onSubscriptionChange={refreshNow}
      />
    </div>
  );
}

// ─── Lifecycle UI Components ─────────────────────────────────────────────────

function LifecycleNotice({ state }: { state: SubscriptionState }) {
  if (state === 'active') return null;

  const notices: Record<
    Exclude<SubscriptionState, 'active'>,
    {
      message: string;
      severity: 'warning' | 'error';
      supportLabel?: 'Contact support' | 'contact support';
      supportSuffix?: string;
    }
  > = {
    payment_failed: {
      message:
        'Your last payment failed. Please update your payment method to avoid service interruption.',
      severity: 'warning',
    },
    grace: {
      message:
        'Your subscription is in a grace period. Payment is overdue — please resolve to avoid suspension.',
      severity: 'warning',
    },
    locked: {
      message:
        'Your subscription is suspended due to non-payment. Paid features are unavailable. Resolve the payment to reactivate, or',
      severity: 'error',
      supportLabel: 'contact support',
      supportSuffix: '.',
    },
    downgraded: {
      message: 'Your subscription has been downgraded to Hobby.',
      severity: 'error',
      supportLabel: 'Contact support',
      supportSuffix: ' to reactivate your previous plan.',
    },
  };

  const notice = notices[state as Exclude<SubscriptionState, 'active'>];
  if (!notice) return null;

  const borderClass =
    notice.severity === 'error'
      ? 'border-destructive/30 bg-destructive/5'
      : 'border-warning/50 bg-warning/10';
  const textClass = notice.severity === 'error' ? 'text-destructive' : 'text-warning-foreground';

  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${borderClass} ${textClass}`}>
      {notice.message}
      {notice.supportSuffix !== undefined ? (
        <>
          {' '}
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {notice.supportLabel}
          </a>
          {notice.supportSuffix}
        </>
      ) : null}
    </div>
  );
}
