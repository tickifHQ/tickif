'use client';

import { Button } from '@repo/ui/components/button';
import { Separator } from '@repo/ui/components/separator';
import { ChevronLeft, CreditCard, Lock, Shield } from 'lucide-react';
import { PLAN_MAP, MOCK_TAX_RATE, MOCK_PAYMENT_METHOD, formatCurrency, type PlanTier } from '@/lib/plan-config';

interface ReviewPayStepProps {
  targetTier: PlanTier;
  onPay: () => void;
  onBack: () => void;
}

export function ReviewPayStep({ targetTier, onPay, onBack }: ReviewPayStepProps) {
  const plan = PLAN_MAP[targetTier];
  const tax = plan.price * MOCK_TAX_RATE;
  const total = plan.price + tax;

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
        <h2 className="text-xl font-semibold text-foreground">Review & Pay</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your order details and complete payment.
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
            <span className="text-muted-foreground">Tax (18%)</span>
            <span className="font-medium text-foreground">{formatCurrency(tax)}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">Total</span>
            <div className="text-right">
              <span className="text-lg font-bold text-foreground">{formatCurrency(total)}</span>
              <span className="text-sm text-muted-foreground"> / month</span>
              <p className="text-xs text-muted-foreground">Billed monthly</p>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-5" />

      {/* Payment Method (mock) */}
      <div>
        <h3 className="text-sm font-semibold text-foreground">Payment Method</h3>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <CreditCard className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {MOCK_PAYMENT_METHOD.brand} •••• {MOCK_PAYMENT_METHOD.last4}
            </span>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Change
          </button>
        </div>
      </div>

      {/* Pay button */}
      <Button className="mt-6 w-full" size="lg" onClick={onPay}>
        <Lock className="size-4" />
        Pay {formatCurrency(total)}
      </Button>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Shield className="size-3.5" />
        Secure payment powered by Razorpay. You can cancel or change your plan anytime.
      </div>
    </div>
  );
}
