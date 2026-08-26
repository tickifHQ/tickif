'use client';

import { Button } from '@repo/ui/components/button';
import { Separator } from '@repo/ui/components/separator';
import { ArrowRight, ChevronLeft, Shield } from 'lucide-react';
import { PLAN_MAP, ESTIMATED_TAX_RATE, formatCurrency, type PlanTier } from '@/lib/plan-config';

interface ReviewPayStepProps {
  targetTier: PlanTier;
  onPay: () => void;
  onBack: () => void;
}

/**
 * Review & Pay step — order summary before checkout handoff.
 *
 * This step shows a preview of the subscription cost. Tax and total are
 * estimated for display only. When E-239 provides real billing totals,
 * these should be replaced with server-provided values.
 *
 * The "Proceed to Checkout" button is the integration boundary for E-116
 * (Razorpay SDK). Currently triggers the mock processing flow.
 */
export function ReviewPayStep({ targetTier, onPay, onBack }: ReviewPayStepProps) {
  const plan = PLAN_MAP[targetTier];
  const estimatedTax = plan.price * ESTIMATED_TAX_RATE;
  const estimatedTotal = plan.price + estimatedTax;

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
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Plan Amount</span>
            <span className="font-medium text-foreground">{formatCurrency(plan.price)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Estimated Tax</span>
            <span className="font-medium text-foreground">{formatCurrency(estimatedTax)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Estimated Total</span>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">
                {formatCurrency(estimatedTotal)}
              </span>
              <span className="text-sm text-muted-foreground"> / month</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-5" />

      {/* Checkout handoff */}
      <Button className="w-full" size="lg" onClick={onPay}>
        Proceed to Checkout
        <ArrowRight className="size-4" />
      </Button>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="size-3.5" />
        Payment is securely processed by Razorpay. You can cancel anytime.
      </div>
    </div>
  );
}
