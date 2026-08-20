'use client';

import { Button } from '@repo/ui/components/button';
import { CheckCircle2 } from 'lucide-react';
import { PLAN_MAP, type PlanTier } from '@/lib/plan-config';

interface SuccessStepProps {
  targetTier: PlanTier;
  onDone: () => void;
}

export function SuccessStep({ targetTier, onDone }: SuccessStepProps) {
  const plan = PLAN_MAP[targetTier];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        Subscription request submitted
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your <strong>{plan.label}</strong> plan is being activated.
        You will be redirected automatically after successful payment.
      </p>
      <Button className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
