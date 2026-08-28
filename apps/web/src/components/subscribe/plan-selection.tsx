'use client';

import type { PlanTier, SubscriptionState } from '@repo/contracts';
import { PLANS } from '@/lib/plan-config';
import { PlanCard } from './plan-card';

interface PlanSelectionProps {
  currentTier: PlanTier;
  lifecycleState: SubscriptionState;
  onSelectPlan: (tier: PlanTier) => void;
}

/**
 * Plan selection grid.
 *
 * Lifecycle awareness:
 * - active/payment_failed/grace: allow plan changes
 * - locked: disable all upgrade actions (org is suspended)
 * - downgraded: show plans but note that org needs to reactivate first
 */
export function PlanSelection({ currentTier, lifecycleState, onSelectPlan }: PlanSelectionProps) {
  const isLocked = lifecycleState === 'locked' || lifecycleState === 'downgraded';

  return (
    <div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Choose your plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the plan that works best for your design business.
        </p>
      </div>

      {isLocked && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center text-sm text-destructive">
          {lifecycleState === 'locked'
            ? 'Your subscription is currently suspended. Plan changes are unavailable until the payment issue is resolved.'
            : 'Your subscription has been downgraded. Please contact support to reactivate.'}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isCurrent={plan.tier === currentTier}
            isLocked={isLocked}
            onSelect={onSelectPlan}
          />
        ))}
      </div>
    </div>
  );
}
