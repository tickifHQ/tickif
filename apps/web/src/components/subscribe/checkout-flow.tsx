'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { Button } from '@repo/ui/components/button';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type { PlanTier, SubscriptionState } from '@repo/contracts';
import { isUpgrade, isDowngrade, isValidTier, PLAN_MAP } from '@/lib/plan-config';
import { PlanSelection } from './plan-selection';
import { UpgradeConfirmationStep } from './upgrade-confirmation-step';
import { DowngradeConfirmationStep } from './downgrade-confirmation-step';
import { ReviewPayStep } from './review-pay-step';
import { api } from '@/lib/api';

// ─── State Machine ───────────────────────────────────────────────────────────

type FlowStep =
  | { step: 'select' }
  | { step: 'confirm-upgrade'; targetTier: PlanTier }
  | { step: 'confirm-downgrade'; targetTier: PlanTier }
  | { step: 'review'; targetTier: PlanTier }
  | { step: 'processing' }
  | { step: 'pending'; targetTier: PlanTier }
  | { step: 'success'; targetTier: PlanTier; kind: 'upgrade' | 'downgrade' }
  | { step: 'error'; message: string }
  | { step: 'cancelled' };

interface CheckoutFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
  lifecycleState: SubscriptionState;
  onSubscriptionChange?: () => void;
}

/**
 * E-120 Subscribe / Upgrade flow dialog.
 *
 * Multi-step state machine:
 * - Upgrade:    select → confirm-upgrade → review → processing → pending → success
 * - Downgrade:  select → confirm-downgrade → pending → success
 *
 * Integration:
 * - Current plan from E-119 (GET /api/billing/subscription)
 * - Checkout via E-116 (POST /api/billing/subscribe → Razorpay shortUrl)
 * - Activation via E-117 webhook (authoritative — never fakes completion)
 *
 * The processing step calls the real API; the pending step shows while
 * waiting for Razorpay redirect / webhook confirmation.
 */
export function CheckoutFlow({
  open,
  onOpenChange,
  currentTier,
  lifecycleState,
  onSubscriptionChange,
}: CheckoutFlowProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>({ step: 'select' });
  const [isApiLoading, setIsApiLoading] = useState(false);

  // Reset flow when dialog closes
  useEffect(() => {
    if (!open) {
      setFlowStep({ step: 'select' });
      setIsApiLoading(false);
    }
  }, [open]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Guard: invalid currentTier
  if (!isValidTier(currentTier)) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle className="sr-only">Plan subscription</DialogTitle>
          <div className="flex flex-col items-center py-12 text-center">
            <p className="text-lg font-semibold text-foreground">Unable to load plan information</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your current subscription could not be identified. Please contact support.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function handleSelectPlan(targetTier: PlanTier) {
    if (targetTier === currentTier) return;
    if (isUpgrade(currentTier, targetTier)) {
      setFlowStep({ step: 'confirm-upgrade', targetTier });
    } else if (isDowngrade(currentTier, targetTier)) {
      setFlowStep({ step: 'confirm-downgrade', targetTier });
    }
  }

  function handleUpgradeConfirm(targetTier: PlanTier) {
    setFlowStep({ step: 'review', targetTier });
  }

  async function handleDowngradeConfirm(targetTier: PlanTier) {
    if (targetTier === 'hobby') {
      // Paid → Hobby cancellation: call the real cancel endpoint.
      // E-115 cancels at cycle end via Razorpay; E-117 confirms via webhook.
      setIsApiLoading(true);
      setFlowStep({ step: 'processing' });
      try {
        const response = await api.api.billing.cancel.$post({});

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            (error as { error?: { message?: string } })?.error?.message ??
            `Cancellation failed (${response.status})`;
          setFlowStep({ step: 'error', message });
        } else {
          // Cancellation scheduled — subscription stays active until period ends.
          setFlowStep({ step: 'success', targetTier, kind: 'downgrade' });
        }
      } catch (err) {
        setFlowStep({
          step: 'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
        });
      } finally {
        setIsApiLoading(false);
      }
    } else {
      // Paid → paid downgrade (e.g., Corporate → Professional+)
      setIsApiLoading(true);
      setFlowStep({ step: 'processing' });
      try {
        const response = await api.api.billing['change-plan'].$post({
          json: { targetTier },
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            (error as { error?: { message?: string } })?.error?.message ??
            `Plan change failed (${response.status})`;
          setFlowStep({ step: 'error', message });
        } else {
          setFlowStep({ step: 'success', targetTier, kind: 'downgrade' });
        }
      } catch (err) {
        setFlowStep({
          step: 'error',
          message: err instanceof Error ? err.message : 'An unexpected error occurred',
        });
      } finally {
        setIsApiLoading(false);
      }
    }
  }

  async function handlePay(targetTier: PlanTier) {
    setIsApiLoading(true);
    setFlowStep({ step: 'processing' });

    try {
      // Hobby → paid: create a new Razorpay subscription via /subscribe.
      // Paid → paid: change the existing subscription via /change-plan.
      const isNewSubscription = currentTier === 'hobby';

      if (isNewSubscription) {
        const response = await api.api.billing.subscribe.$post({
          json: { targetTier },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            (error as { error?: { message?: string } })?.error?.message ??
            `Subscription failed (${response.status})`;
          setFlowStep({ step: 'error', message });
          setIsApiLoading(false);
          return;
        }

        const data = await response.json();
        const { shortUrl } = data as { razorpaySubscriptionId: string; shortUrl: string | null };

        if (shortUrl) {
          setFlowStep({ step: 'pending', targetTier });
          setTimeout(() => {
            window.location.href = shortUrl;
          }, 500);
        } else {
          setFlowStep({ step: 'pending', targetTier });
        }
      } else {
        // Paid → paid upgrade (e.g., Professional+ → Corporate)
        const response = await api.api.billing['change-plan'].$post({
          json: { targetTier },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const message =
            (error as { error?: { message?: string } })?.error?.message ??
            `Plan change failed (${response.status})`;
          setFlowStep({ step: 'error', message });
          setIsApiLoading(false);
          return;
        }

        // Change-plan is deferred to cycle end — show success acknowledgment.
        setFlowStep({ step: 'success', targetTier, kind: 'upgrade' });
      }
    } catch (err) {
      setFlowStep({
        step: 'error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
      });
    } finally {
      setIsApiLoading(false);
    }
  }

  function handleBack() {
    if (flowStep.step === 'confirm-upgrade' || flowStep.step === 'confirm-downgrade') {
      setFlowStep({ step: 'select' });
    } else if (flowStep.step === 'review') {
      const { targetTier } = flowStep;
      setFlowStep({ step: 'confirm-upgrade', targetTier });
    }
  }

  function handleDone() {
    handleOpenChange(false);
    onSubscriptionChange?.();
  }

  const isBlocking = flowStep.step === 'processing' || flowStep.step === 'pending';
  const isWide = flowStep.step === 'select';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={isWide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}
        showCloseButton={!isBlocking}
        onInteractOutside={isBlocking ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isBlocking ? (e) => e.preventDefault() : undefined}
      >
        <DialogTitle className="sr-only">Plan subscription</DialogTitle>

        {flowStep.step === 'select' && (
          <PlanSelection
            currentTier={currentTier}
            lifecycleState={lifecycleState}
            onSelectPlan={handleSelectPlan}
          />
        )}

        {flowStep.step === 'confirm-upgrade' && (
          <UpgradeConfirmationStep
            currentTier={currentTier}
            targetTier={flowStep.targetTier}
            onConfirm={() => handleUpgradeConfirm(flowStep.targetTier)}
            onBack={handleBack}
          />
        )}

        {flowStep.step === 'confirm-downgrade' && (
          <DowngradeConfirmationStep
            currentTier={currentTier}
            targetTier={flowStep.targetTier}
            onConfirm={() => handleDowngradeConfirm(flowStep.targetTier)}
            onBack={handleBack}
          />
        )}

        {flowStep.step === 'review' && (
          <ReviewPayStep
            targetTier={flowStep.targetTier}
            onPay={() => handlePay(flowStep.targetTier)}
            onBack={handleBack}
            isLoading={isApiLoading}
          />
        )}

        {flowStep.step === 'processing' && <ProcessingStep />}

        {flowStep.step === 'pending' && <PendingStep />}

        {flowStep.step === 'success' && (
          <SuccessStep
            targetTier={flowStep.targetTier}
            kind={flowStep.kind}
            onDone={handleDone}
          />
        )}

        {flowStep.step === 'error' && (
          <ErrorStep
            message={flowStep.message}
            onRetry={() => setFlowStep({ step: 'select' })}
            onClose={() => handleOpenChange(false)}
          />
        )}

        {flowStep.step === 'cancelled' && (
          <CancelledStep onClose={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Terminal Step Components ─────────────────────────────────────────────────

function ProcessingStep() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative flex size-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
      <h2 className="mt-6 text-lg font-semibold text-foreground">
        Setting up your subscription...
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Please don&rsquo;t close this window.
      </p>
    </div>
  );
}

function PendingStep() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <Clock className="size-10 text-primary" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        Redirecting to payment...
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        You&rsquo;re being redirected to Razorpay to complete payment.
        Once confirmed, your subscription will activate automatically.
      </p>
    </div>
  );
}

function SuccessStep({
  targetTier,
  kind,
  onDone,
}: {
  targetTier: PlanTier;
  kind: 'upgrade' | 'downgrade';
  onDone: () => void;
}) {
  const plan = PLAN_MAP[targetTier];

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        {kind === 'upgrade' ? 'Subscription updated' : 'Plan change confirmed'}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {kind === 'upgrade' ? (
          <>
            Your <strong>{plan.label}</strong> plan is now active. You can manage your subscription
            from the Plan &amp; Billing page.
          </>
        ) : (
          <>
            Your plan will change to <strong>{plan.label}</strong> at the end of your current
            billing period. Your data and resources remain preserved.
          </>
        )}
      </p>
      <Button className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function ErrorStep({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="size-8 text-destructive" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={onRetry}>Try Again</Button>
      </div>
    </div>
  );
}

function CancelledStep({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-lg font-semibold text-foreground">Checkout cancelled</p>
      <p className="mt-2 text-sm text-muted-foreground">
        No changes were made to your subscription.
      </p>
      <Button className="mt-6" variant="outline" onClick={onClose}>Close</Button>
    </div>
  );
}
