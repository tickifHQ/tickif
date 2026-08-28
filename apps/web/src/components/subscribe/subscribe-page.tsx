'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@repo/ui/components/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { SubscriptionState, SubscriptionResponse } from '@repo/contracts';
import { PLAN_MAP } from '@/lib/plan-config';
import { CheckoutFlow } from './checkout-flow';
import { api } from '@/lib/api';

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
export function SubscribePage() {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.api.billing.subscription.$get();
      if (!response.ok) {
        setError('Failed to load subscription');
        return;
      }
      const data = (await response.json()) as SubscriptionResponse;
      setSubscription(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="mt-3 text-sm text-muted-foreground">{error ?? 'Unable to load subscription'}</p>
        <Button variant="outline" className="mt-4" onClick={() => void fetchSubscription()}>
          Retry
        </Button>
      </div>
    );
  }

  const { tier, lifecycleState } = subscription;
  const currentPlan = PLAN_MAP[tier];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Current plan summary */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Subscription</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan and billing.
        </p>

        <div className="mt-4 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-lg font-semibold text-foreground">{currentPlan.label}</p>
            </div>
            <LifecycleBadge state={lifecycleState} />
          </div>
          {subscription.currentPeriodEnd && (
            <p className="mt-2 text-xs text-muted-foreground">
              Current period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}
            </p>
          )}
        </div>

        {/* Lifecycle warnings */}
        <LifecycleNotice state={lifecycleState} />
      </div>

      {/* Plan selection / upgrade button */}
      <Button onClick={() => setDialogOpen(true)} disabled={lifecycleState === 'locked'}>
        {tier === 'hobby' ? 'Upgrade Plan' : 'Change Plan'}
      </Button>

      <p className="mt-2 text-xs text-muted-foreground">
        For billing history and lifecycle details, visit{' '}
        <a href="/designer/plan-billing" className="text-primary underline">
          Plan &amp; Billing
        </a>.
      </p>

      {/* Checkout dialog */}
      <CheckoutFlow
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentTier={tier}
        lifecycleState={lifecycleState}
        onSubscriptionChange={fetchSubscription}
      />
    </div>
  );
}

// ─── Lifecycle UI Components ─────────────────────────────────────────────────

function LifecycleBadge({ state }: { state: SubscriptionState }) {
  const config: Record<SubscriptionState, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-green-100 text-green-800' },
    payment_failed: { label: 'Payment Issue', className: 'bg-yellow-100 text-yellow-800' },
    grace: { label: 'Grace Period', className: 'bg-yellow-100 text-yellow-800' },
    locked: { label: 'Suspended', className: 'bg-red-100 text-red-800' },
    downgraded: { label: 'Downgraded', className: 'bg-muted text-muted-foreground' },
  };

  const { label, className } = config[state];

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function LifecycleNotice({ state }: { state: SubscriptionState }) {
  if (state === 'active') return null;

  const notices: Record<Exclude<SubscriptionState, 'active'>, { message: string; severity: 'warning' | 'error' }> = {
    payment_failed: {
      message: 'Your last payment failed. Please update your payment method to avoid service interruption.',
      severity: 'warning',
    },
    grace: {
      message: 'Your subscription is in a grace period. Payment is overdue — please resolve to avoid suspension.',
      severity: 'warning',
    },
    locked: {
      message: 'Your subscription is suspended due to non-payment. Paid features are unavailable. Contact support or resolve the payment to reactivate.',
      severity: 'error',
    },
    downgraded: {
      message: 'Your subscription has been downgraded to Hobby. Contact support to reactivate your previous plan.',
      severity: 'error',
    },
  };

  const notice = notices[state as Exclude<SubscriptionState, 'active'>];
  if (!notice) return null;

  const borderClass = notice.severity === 'error' ? 'border-destructive/30 bg-destructive/5' : 'border-yellow-300/50 bg-yellow-50';
  const textClass = notice.severity === 'error' ? 'text-destructive' : 'text-yellow-800';

  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${borderClass} ${textClass}`}>
      {notice.message}
    </div>
  );
}
