'use client';

import { Button } from '@repo/ui/components/button';
import { CheckCircle2 } from 'lucide-react';
import { PLAN_MAP, type PlanTier } from '@/lib/plan-config';

interface SuccessStepProps {
  targetTier: PlanTier;
  onDone: () => void;
}

/**
 * Success step — shown after the checkout/processing flow completes.
 *
 * When E-116 integrates real Razorpay payments, the copy here should reflect
 * whether the payment was confirmed vs still pending webhook confirmation.
 */
export function SuccessStep({ targetTier, onDone }: SuccessStepProps) {
  const plan = PLAN_MAP[targetTier];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">Subscription updated</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your <strong>{plan.label}</strong> plan is now active. You can manage your subscription
        from the Plan & Billing page.
      </p>
      <Button className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
