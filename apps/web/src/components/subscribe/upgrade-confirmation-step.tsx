'use client';

import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { ArrowRight, Check, ChevronLeft } from 'lucide-react';
import { PLAN_MAP, formatCurrency, type PlanTier } from '@/lib/plan-config';

interface UpgradeConfirmationStepProps {
  currentTier: PlanTier;
  targetTier: PlanTier;
  onConfirm: () => void;
  onBack: () => void;
}

export function UpgradeConfirmationStep({
  currentTier,
  targetTier,
  onConfirm,
  onBack,
}: UpgradeConfirmationStepProps) {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];

  // Features user gains (in target but not in current)
  const gains = target.features.filter((f) => !current.features.includes(f));

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>

      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Confirm Upgrade</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You are upgrading from {current.label} to {target.label}
        </p>
      </div>

      {/* Plan comparison */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <Card radius="xl" className="flex-1 p-4 text-center">
          <p className="text-xs text-muted-foreground">Current Plan</p>
          <p className="mt-1 text-base font-bold text-foreground">{current.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatCurrency(current.price)} / month
          </p>
        </Card>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
        <Card radius="xl" className="flex-1 border-primary/40 bg-primary/5 p-4 text-center">
          <p className="text-xs text-muted-foreground">New Plan</p>
          <p className="mt-1 text-base font-bold text-foreground">{target.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatCurrency(target.price)} / month
          </p>
        </Card>
      </div>

      {/* What you'll get */}
      {gains.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-foreground">What you&rsquo;ll get:</p>
          <ul className="mt-3 space-y-2">
            {gains.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="size-4 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="size-4 shrink-0 text-primary" />
              And more premium features
            </li>
          </ul>
        </div>
      )}

      {/* Total */}
      <div className="mt-6 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
        <span className="text-sm font-medium text-foreground">Total</span>
        <div className="text-right">
          <span className="text-lg font-bold text-foreground">
            {formatCurrency(target.price)}
          </span>
          <span className="text-sm text-muted-foreground"> / month</span>
          <p className="text-xs text-muted-foreground">Billed monthly</p>
        </div>
      </div>

      <Button className="mt-5 w-full" onClick={onConfirm}>
        Proceed to Checkout
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
