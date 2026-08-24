'use client';

import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Check, Crown, Building2, Sparkles } from 'lucide-react';
import { PLANS, formatCurrency, getCumulativeFeatures, type PlanTier } from '@/lib/plan-config';

interface PlanSelectionStepProps {
  currentTier: PlanTier;
  onSelectPlan: (tier: PlanTier) => void;
}

const PLAN_ICONS: Record<PlanTier, typeof Crown> = {
  hobby: Sparkles,
  professional_plus: Crown,
  corporate: Building2,
};

export function PlanSelectionStep({ currentTier, onSelectPlan }: PlanSelectionStepProps) {
  return (
    <div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Choose your plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the plan that works best for your design business.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.tier === currentTier;
          const Icon = PLAN_ICONS[plan.tier];
          const features = getCumulativeFeatures(plan.tier);

          return (
            <Card
              key={plan.tier}
              radius="xl"
              className={`relative flex flex-col ${
                isCurrent ? 'border-primary/40 bg-primary/5' : ''
              }`}
            >
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-2">
                  <Icon className="size-5 text-primary" />
                  <span className="text-base font-semibold text-foreground">{plan.label}</span>
                </div>

                <div className="mt-3">
                  <span className="text-3xl font-bold text-foreground">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-sm text-muted-foreground"> / month</span>
                </div>
                {plan.price === 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">Free</p>
                )}

                <ul className="mt-4 flex-1 space-y-2">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                      <Check className="size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isCurrent ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                      aria-label={`${plan.label} is your current plan`}
                    >
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => onSelectPlan(plan.tier)}
                      aria-label={`Select ${plan.label} plan`}
                    >
                      Select Plan
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Payment is securely processed by Razorpay. You can cancel or change your plan anytime.
      </p>
    </div>
  );
}
