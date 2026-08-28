'use client';

import { Button } from '@repo/ui/components/button';
import { Separator } from '@repo/ui/components/separator';
import { ArrowRight, ChevronLeft, Shield } from 'lucide-react';
import type { PlanTier } from '@repo/contracts';
import { PLAN_MAP, formatCurrency } from '@/lib/plan-config';

interface ReviewPayStepProps {
  targetTier: PlanTier;
  onPay: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

/**
 * Review & Pay step — order summary before checkout handoff.
 *
 * Shows the plan amount as charged by Razorpay. Tax (GST) is included in the
 * Razorpay plan price — we do NOT add a separate tax estimate because the
 * plan amounts (₹2,999 / ₹7,999) are what Razorpay charges directly.
 */
export function ReviewPayStep({ targetTier, onPay, onBack, isLoading }: ReviewPayStepProps) {
  const plan = PLAN_MAP[targetTier];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        disabled={isLoading}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>

      <div>
        <h2 className="text-xl font-semibold text-foreground">Review Order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your subscription details before proceeding to payment.
        </p>
      </div>

      {/* Order Summary */}
      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Order Summary</h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium text-foreground">{plan.label}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Billing Cycle</span>
            <span className="font-medium text-foreground">Monthly</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Amount</span>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">
                {formatCurrency(plan.price)}
              </span>
              <span className="text-sm text-muted-foreground"> /month</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-5" />

      {/* Checkout handoff */}
      <Button className="w-full" size="lg" onClick={onPay} disabled={isLoading}>
        {isLoading ? 'Setting up checkout...' : 'Proceed to Checkout'}
        {!isLoading && <ArrowRight className="size-4" />}
      </Button>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="size-3.5" />
        Payment is securely processed by Razorpay. You can cancel anytime.
      </div>
    </div>
  );
}
