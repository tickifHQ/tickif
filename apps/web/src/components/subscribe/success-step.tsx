'use client';

import { Button } from '@repo/ui/components/button';
import { CheckCircle2 } from 'lucide-react';
import { PLAN_MAP, type PlanTier } from '@/lib/plan-config';

interface SuccessStepProps {
  targetTier: PlanTier;
  kind: 'upgrade' | 'downgrade';
  onDone: () => void;
}

/**
 * Success/confirmation step.
 *
 * For upgrades: shown after the mock processing timer completes.
 * For downgrades: shown immediately as a plan-change acknowledgment.
 *
 * When E-116 provides real Razorpay/cancellation APIs, the copy here should
 * reflect whether the action was confirmed vs still pending backend processing.
 */
export function SuccessStep({ targetTier, kind, onDone }: SuccessStepProps) {
  const plan = PLAN_MAP[targetTier];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        {kind === 'upgrade' ? 'Subscription updated' : 'Downgrade confirmed'}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {kind === 'upgrade' ? (
          <>
            Your <strong>{plan.label}</strong> plan is now active. You can manage your subscription
            from the Plan & Billing page.
          </>
        ) : (
          <>
            You have chosen to move to the <strong>{plan.label}</strong> plan. Once billing
            integration is active, this change will take effect at the end of your current billing
            period.
          </>
        )}
      </p>
      <Button className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
