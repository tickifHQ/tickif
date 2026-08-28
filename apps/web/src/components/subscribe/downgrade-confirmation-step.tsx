'use client';

import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { ArrowRight, ChevronLeft, Info, X } from 'lucide-react';
import type { PlanTier } from '@repo/contracts';
import { PLAN_MAP, formatCurrency, getDowngradeLosses } from '@/lib/plan-config';

interface DowngradeConfirmationStepProps {
  currentTier: PlanTier;
  targetTier: PlanTier;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Downgrade/cancellation confirmation step.
 *
 * Shows features lost when moving to a lower tier.
 * For paid → Hobby: this is effectively a subscription cancellation.
 *
 * Restored from PR #392, adapted:
 * - No "Free" wording (shows ₹0/month for Hobby)
 * - Uses @repo/contracts PlanTier
 * - "Data preserved" notice retained
 */
export function DowngradeConfirmationStep({
  currentTier,
  targetTier,
  onConfirm,
  onBack,
}: DowngradeConfirmationStepProps) {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];
  const losses = getDowngradeLosses(currentTier, targetTier);
  const isCancellation = targetTier === 'hobby';

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
        <h2 className="text-xl font-semibold text-foreground">
          {isCancellation ? 'Cancel Subscription' : 'Confirm Downgrade'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isCancellation
            ? `You are cancelling your ${current.label} subscription`
            : `You are downgrading from ${current.label} to ${target.label}`}
        </p>
      </div>

      {/* Plan comparison */}
      <div className="mt-6 flex items-center justify-center gap-4">
        <Card radius="xl" className="flex-1 p-4 text-center">
          <p className="text-xs text-muted-foreground">Current Plan</p>
          <p className="mt-1 text-base font-bold text-foreground">{current.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatCurrency(current.price)}/month
          </p>
        </Card>
        <ArrowRight className="size-5 shrink-0 text-muted-foreground" />
        <Card radius="xl" className="flex-1 p-4 text-center">
          <p className="text-xs text-muted-foreground">New Plan</p>
          <p className="mt-1 text-base font-bold text-foreground">{target.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatCurrency(target.price)}/month
          </p>
        </Card>
      </div>

      {/* Features lost */}
      {losses.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-destructive">
            Features no longer available on {target.label}:
          </p>
          <ul className="mt-3 space-y-2">
            {losses.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                <X className="size-4 shrink-0 text-destructive" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data preserved notice */}
      <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Your data and resources will be preserved. If you upgrade again later, frozen resources
          will be restored.
        </p>
      </div>

      <Button variant="destructive" className="mt-5 w-full" onClick={onConfirm}>
        {isCancellation ? 'Cancel Subscription' : 'Confirm Downgrade'}
      </Button>
    </div>
  );
}
