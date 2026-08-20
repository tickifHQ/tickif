'use client';

import { Button } from '@repo/ui/components/button';
import { Card } from '@repo/ui/components/card';
import { Alert, AlertDescription } from '@repo/ui/components/alert';
import { ArrowRight, ChevronLeft, Info, X } from 'lucide-react';
import { PLAN_MAP, formatCurrency, type PlanTier } from '@/lib/plan-config';

interface DowngradeConfirmationStepProps {
  currentTier: PlanTier;
  targetTier: PlanTier;
  onConfirm: () => void;
  onBack: () => void;
}

export function DowngradeConfirmationStep({
  currentTier,
  targetTier,
  onConfirm,
  onBack,
}: DowngradeConfirmationStepProps) {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];

  // Features the user loses
  const losses = current.exclusiveFeatures;

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
        <h2 className="text-xl font-semibold text-foreground">Confirm Downgrade</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You are downgrading from {current.label} to {target.label}
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
        <Card radius="xl" className="flex-1 p-4 text-center">
          <p className="text-xs text-muted-foreground">New Plan</p>
          <p className="mt-1 text-base font-bold text-foreground">{target.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {target.price === 0 ? 'Free' : `${formatCurrency(target.price)} / month`}
          </p>
        </Card>
      </div>

      {/* What you'll lose */}
      {losses.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-destructive">You will lose access to:</p>
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

      {/* Preservation notice */}
      <Alert variant="info" className="mt-5">
        <Info />
        <AlertDescription>
          These resources will be preserved and restored if you upgrade again later.
        </AlertDescription>
      </Alert>

      <Button variant="destructive" className="mt-5 w-full" onClick={onConfirm}>
        Confirm Downgrade
      </Button>
    </div>
  );
}
