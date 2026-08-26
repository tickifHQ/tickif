'use client';

import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Check, Crown, Building2, Sparkles } from 'lucide-react';
import type { PlanTier } from '@repo/contracts';
import { formatCurrency, getCumulativeFeatures, type PlanDefinition } from '@/lib/plan-config';

const PLAN_ICONS: Record<PlanTier, typeof Crown> = {
  hobby: Sparkles,
  professional_plus: Crown,
  corporate: Building2,
};

interface PlanCardProps {
  plan: PlanDefinition;
  isCurrent: boolean;
  isLocked: boolean;
  onSelect: (tier: PlanTier) => void;
}

/**
 * Individual plan card. Displays tier name, pricing, and features.
 *
 * Rules:
 * - Never displays "Free" for Hobby (shows ₹0/month)
 * - Professional+ does NOT show an add-seat affordance
 * - Locked state disables upgrade actions
 */
export function PlanCard({ plan, isCurrent, isLocked, onSelect }: PlanCardProps) {
  const Icon = PLAN_ICONS[plan.tier];
  const features = getCumulativeFeatures(plan.tier);

  return (
    <Card
      radius="xl"
      className={`relative flex flex-col ${isCurrent ? 'border-primary/40 bg-primary/5' : ''}`}
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
          <span className="text-sm text-muted-foreground"> /month</span>
        </div>

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
              disabled={isLocked}
              onClick={() => onSelect(plan.tier)}
              aria-label={`Select ${plan.label} plan`}
            >
              {isLocked ? 'Unavailable' : 'Select'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
