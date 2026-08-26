'use client';

import { Button } from '@repo/ui/components/button';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { ArrowRight, Info } from 'lucide-react';
import { PLAN_MAP, formatCurrency, type PlanTier } from '@/lib/plan-config';

interface ReactivateStepProps {
  currentTier: PlanTier;
  onConfirm: () => void;
}

/**
 * Locked-org reactivation. Not a plan picker — the paid tier is still
 * `plan_tier` (schema: locked ⇒ plan_tier = pre_lapse_tier).
 */
export function ReactivateStep({ currentTier, onConfirm }: ReactivateStepProps) {
  const plan = PLAN_MAP[currentTier];

  return (
    <div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Reactivate Subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account is locked. Reactivate {plan.label} to restore full access.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">Current plan</p>
        <p className="mt-0.5 text-base font-bold text-foreground">{plan.label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {formatCurrency(plan.price)} / month
        </p>
      </div>

      <Alert variant="info" className="mt-5">
        <Info />
        <AlertDescription>
          Plan changes are unavailable while the account is locked. Pay to restore this plan, then
          manage your subscription from Plan &amp; Billing.
        </AlertDescription>
      </Alert>

      <Button className="mt-5 w-full" onClick={onConfirm}>
        Proceed to Checkout
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
