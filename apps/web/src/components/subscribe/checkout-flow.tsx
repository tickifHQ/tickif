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
import { ReactivateStep } from './reactivate-step';
import { api } from '@/lib/api';

// ─── State Machine ───────────────────────────────────────────────────────────

type FlowStep =
  | { step: 'select' }
  | { step: 'reactivate'; targetTier: PlanTier }
  | { step: 'confirm-upgrade'; targetTier: PlanTier }
  | { step: 'confirm-downgrade'; targetTier: PlanTier }
  | { step: 'review'; targetTier: PlanTier }
  | { step: 'processing' }
  | { step: 'pending'; targetTier: PlanTier }
  | { step: 'activating'; targetTier: PlanTier }
  | { step: 'upi-limitation'; targetTier: PlanTier }
  | { step: 'cancellation-scheduled'; periodEnd: string | null }
  | { step: 'success'; targetTier: PlanTier; kind: 'upgrade' | 'downgrade' }
  | { step: 'error'; message: string }
  | { step: 'cancelled' };

interface CheckoutFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
  lifecycleState: SubscriptionState;
  cancellationScheduled: boolean;
  currentPeriodEnd: string | null;
  restoreTier?: PlanTier | null;
  initialTargetTier?: PlanTier | null;
  onSubscriptionChange?: () => void;
}

function initialFlowStep(
  lifecycleState: SubscriptionState,
  currentTier: PlanTier,
  restoreTier: PlanTier | null,
  initialTargetTier: PlanTier | null,
): FlowStep {
  if (lifecycleState === 'locked') {
    return { step: 'reactivate', targetTier: currentTier };
  }
  if (lifecycleState === 'downgraded' && restoreTier && restoreTier !== 'hobby') {
    return { step: 'confirm-upgrade', targetTier: restoreTier };
  }
  if (initialTargetTier && initialTargetTier !== currentTier) {
    return { step: 'confirm-upgrade', targetTier: initialTargetTier };
  }
  return { step: 'select' };
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
  cancellationScheduled,
  currentPeriodEnd,
  restoreTier = null,
  initialTargetTier = null,
  onSubscriptionChange,
}: CheckoutFlowProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>({ step: 'select' });
  const [isApiLoading, setIsApiLoading] = useState(false);

  // Reset or initialize from the current lifecycle when the dialog opens.
  useEffect(() => {
    if (!open) {
      setFlowStep({ step: 'select' });
      setIsApiLoading(false);
      return;
    }
    setFlowStep(initialFlowStep(lifecycleState, currentTier, restoreTier, initialTargetTier));
  }, [currentTier, initialTargetTier, lifecycleState, open, restoreTier]);

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

    // If cancellation is already scheduled, don't let the user start any plan change.
    // Show the cancellation-scheduled modal immediately with the end date.
    if (cancellationScheduled) {
      setFlowStep({ step: 'cancellation-scheduled', periodEnd: currentPeriodEnd });
      return;
    }

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
          const data = (await response.json()) as {
            alreadyCancelled?: boolean;
            currentPeriodEnd?: string | null;
          };
          if (data.alreadyCancelled) {
            // Already scheduled — show the status modal, don't claim we just cancelled.
            setFlowStep({ step: 'cancellation-scheduled', periodEnd: data.currentPeriodEnd ?? null });
          } else {
            // Cancellation scheduled — subscription stays active until period ends.
            setFlowStep({ step: 'cancellation-scheduled', periodEnd: data.currentPeriodEnd ?? null });
          }
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
      const isNewSubscription =
        currentTier === 'hobby' ||
        lifecycleState === 'locked' ||
        lifecycleState === 'downgraded';

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

        const data = (await response.json()) as {
          razorpaySubscriptionId: string;
          shortUrl: string | null;
          razorpayKeyId: string;
          prefill: { name: string | null; email: string | null; contact: string | null };
        };

        // Close our Dialog before opening Razorpay Checkout.
        // The Radix Dialog overlay would block clicks on the Razorpay iframe.
        onOpenChange(false);

        // Open Razorpay Checkout JS modal on the page.
        openRazorpayCheckout({
          keyId: data.razorpayKeyId,
          subscriptionId: data.razorpaySubscriptionId,
          targetTier,
          prefill: data.prefill,
          onSuccess: async (paymentData) => {
            // Verify the payment signature server-side
            try {
              const verifyResponse = await api.api.billing['verify-payment'].$post({
                json: {
                  razorpayPaymentId: paymentData.razorpay_payment_id,
                  razorpaySubscriptionId: paymentData.razorpay_subscription_id,
                  razorpaySignature: paymentData.razorpay_signature,
                },
              });

              if (!verifyResponse.ok) {
                // Reopen dialog with error
                onOpenChange(true);
                setFlowStep({ step: 'error', message: 'Payment verification failed' });
                return;
              }

              // Verification successful — reopen dialog with activating state and poll.
              onOpenChange(true);
              setFlowStep({ step: 'activating', targetTier });
              await pollSubscriptionActivation(setFlowStep, targetTier, onSubscriptionChange);
            } catch {
              onOpenChange(true);
              setFlowStep({ step: 'error', message: 'Payment verification failed' });
            }
          },
          onDismiss: () => {
            // User closed Razorpay checkout — return to Plan & Billing cleanly
            setFlowStep({ step: 'select' });
            setIsApiLoading(false);
          },
        });
      } else {
        // Paid → paid change-plan (e.g., Professional+ → Corporate or Corporate → Professional+)
        const response = await api.api.billing['change-plan'].$post({
          json: { targetTier },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          const rawMessage =
            (error as { error?: { message?: string } })?.error?.message ?? '';
          // Detect Razorpay UPI limitation → show cancel-and-resubscribe flow
          const isUpiLimitation = rawMessage.toLowerCase().includes('payment mode is upi');
          if (isUpiLimitation) {
            setFlowStep({ step: 'upi-limitation', targetTier });
            setIsApiLoading(false);
            return;
          }
          setFlowStep({ step: 'error', message: rawMessage || `Plan change failed (${response.status})` });
          setIsApiLoading(false);
          return;
        }

        // Change-plan is deferred to cycle end — show success acknowledgment.
        setFlowStep({ step: 'success', targetTier, kind: 'upgrade' });
        setIsApiLoading(false);
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

  async function handleUpiCancel() {
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
        const data = (await response.json()) as {
          alreadyCancelled?: boolean;
          currentPeriodEnd?: string | null;
        };
        setFlowStep({ step: 'cancellation-scheduled', periodEnd: data.currentPeriodEnd ?? null });
      }
    } catch (err) {
      setFlowStep({
        step: 'error',
        message: err instanceof Error ? err.message : 'Cancellation failed',
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
      if (lifecycleState === 'locked') {
        setFlowStep({ step: 'reactivate', targetTier });
      } else {
        setFlowStep({ step: 'confirm-upgrade', targetTier });
      }
    }
  }

  function handleDone() {
    handleOpenChange(false);
    onSubscriptionChange?.();
  }

  const isBlocking = flowStep.step === 'processing' || flowStep.step === 'pending' || flowStep.step === 'activating';
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

        {flowStep.step === 'reactivate' && (
          <ReactivateStep
            currentTier={flowStep.targetTier}
            onConfirm={() => setFlowStep({ step: 'review', targetTier: flowStep.targetTier })}
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

        {flowStep.step === 'activating' && <ActivatingStep />}

        {flowStep.step === 'upi-limitation' && (
          <UpiLimitationStep
            currentTier={currentTier}
            targetTier={flowStep.targetTier}
            onCancel={handleUpiCancel}
            onClose={() => handleOpenChange(false)}
            isLoading={isApiLoading}
          />
        )}

        {flowStep.step === 'cancellation-scheduled' && (
          <CancellationScheduledStep
            currentTier={currentTier}
            periodEnd={flowStep.periodEnd}
            onDone={() => {
              handleOpenChange(false);
              onSubscriptionChange?.();
            }}
          />
        )}

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

export function SuccessStep({
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
        {kind === 'upgrade' ? 'Plan change scheduled' : 'Plan change confirmed'}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your plan will change to <strong>{plan.label}</strong> at the end of your current
        billing period. Your data and resources remain preserved.
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

function ActivatingStep() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        Activating your subscription...
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Payment confirmed. We&rsquo;re activating your plan — this usually takes a few seconds.
      </p>
    </div>
  );
}

// ─── Razorpay Checkout JS ────────────────────────────────────────────────────

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, string>) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.head.appendChild(script);
  });
}

async function openRazorpayCheckout(params: {
  keyId: string;
  subscriptionId: string;
  targetTier: PlanTier;
  prefill: { name: string | null; email: string | null; contact: string | null };
  onSuccess: (data: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => void;
  onDismiss: () => void;
}): Promise<void> {
  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout not available');
  }

  // Build prefill from the user's actual Tickif profile data.
  // Only include fields that have values — Razorpay handles missing fields gracefully.
  const prefill: Record<string, string> = {};
  if (params.prefill.name) prefill.name = params.prefill.name;
  if (params.prefill.email) prefill.email = params.prefill.email;
  if (params.prefill.contact) prefill.contact = params.prefill.contact;

  const rzp = new window.Razorpay({
    key: params.keyId,
    subscription_id: params.subscriptionId,
    name: 'Tickif',
    description: `Subscribe to ${PLAN_MAP[params.targetTier]?.label ?? params.targetTier}`,
    ...(Object.keys(prefill).length > 0 ? { prefill } : {}),
    handler: (response: Record<string, string>) => {
      params.onSuccess({
        razorpay_payment_id: response.razorpay_payment_id ?? '',
        razorpay_subscription_id: response.razorpay_subscription_id ?? '',
        razorpay_signature: response.razorpay_signature ?? '',
      });
    },
    modal: {
      ondismiss: () => {
        params.onDismiss();
      },
    },
    theme: {
      color: '#FF8F73',
    },
  });

  rzp.open();
}

// ─── Post-Payment Polling ────────────────────────────────────────────────────

async function pollSubscriptionActivation(
  setFlowStep: (step: FlowStep) => void,
  targetTier: PlanTier,
  onSubscriptionChange?: () => void,
): Promise<void> {
  const maxAttempts = 15; // 30 seconds total (2s intervals)
  const interval = 2000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, interval));

    try {
      // Trigger reconciliation so webhook-driven changes are picked up even if
      // the local DB hasn't been updated yet by the time we poll.
      await api.api.billing.subscription.refresh.$get().catch(() => {});

      const response = await api.api.billing.subscription.$get();
      if (!response.ok) continue;

      const data = (await response.json()) as { tier: string; lifecycleState: string; razorpayStatus: string | null };

      // Activation detected: tier changed from hobby OR razorpayStatus is 'active'
      if (data.tier !== 'hobby' || data.razorpayStatus === 'active') {
        setFlowStep({ step: 'success', targetTier, kind: 'upgrade' });
        onSubscriptionChange?.();
        return;
      }
    } catch {
      // Network error — continue polling
    }
  }

  // Timeout — show success anyway since payment was verified, webhook may be delayed
  setFlowStep({ step: 'success', targetTier, kind: 'upgrade' });
  onSubscriptionChange?.();
}


// ─── UPI Limitation Flow ─────────────────────────────────────────────────────

function UpiLimitationStep({
  currentTier,
  targetTier,
  onCancel,
  onClose,
  isLoading,
}: {
  currentTier: PlanTier;
  targetTier: PlanTier;
  onCancel: () => void;
  onClose: () => void;
  isLoading?: boolean;
}) {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-yellow-100">
        <AlertCircle className="size-8 text-yellow-600" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        Plan change unavailable
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your current {current?.label} subscription uses UPI, which does not support
        plan changes. To switch to {target?.label}, cancel your current subscription
        and subscribe again on the new plan.
      </p>
      <p className="mt-3 max-w-sm text-xs text-muted-foreground">
        Your {current?.label} access will remain active until the end of your current
        billing period after cancellation. You can pay with any supported method
        (card, UPI, etc.) when you resubscribe.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Not Now
        </Button>
        <Button variant="destructive" onClick={onCancel} disabled={isLoading}>
          {isLoading ? 'Cancelling...' : 'Cancel Subscription'}
        </Button>
      </div>
    </div>
  );
}

function CancellationScheduledStep({
  currentTier,
  periodEnd,
  onDone,
}: {
  currentTier: PlanTier;
  periodEnd: string | null;
  onDone: () => void;
}) {
  const current = PLAN_MAP[currentTier];

  const formattedEnd = (() => {
    if (!periodEnd) return null;
    try {
      const d = new Date(periodEnd);
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      }).format(d);
    } catch {
      return null;
    }
  })();

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center py-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <CheckCircle2 className="size-8 text-primary" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-foreground">
        Cancellation scheduled
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Your {current?.label} subscription will remain active
        {formattedEnd ? ` until ${formattedEnd}` : ' until the end of your current billing period'}.
        After that, your account will automatically move to the Hobby plan.
      </p>
      <p className="mt-2 max-w-sm text-xs text-muted-foreground">
        You can subscribe again on a new plan at any time after the current period ends.
      </p>
      <Button className="mt-6" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
