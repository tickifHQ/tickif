'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@repo/ui/components/dialog';
import type { SubscriptionState } from '@repo/contracts';
import type { PlanTier } from '@/lib/plan-config';
import { isUpgrade, isValidTier } from '@/lib/plan-config';
import { PlanSelectionStep } from './plan-selection-step';
import { UpgradeConfirmationStep } from './upgrade-confirmation-step';
import { DowngradeConfirmationStep } from './downgrade-confirmation-step';
import { ReviewPayStep } from './review-pay-step';
import { ProcessingStep } from './processing-step';
import { SuccessStep } from './success-step';
import { ReactivateStep } from './reactivate-step';

type FlowStep =
  | { step: 'select' }
  | { step: 'reactivate'; targetTier: PlanTier }
  | { step: 'confirm-upgrade'; targetTier: PlanTier }
  | { step: 'confirm-downgrade'; targetTier: PlanTier }
  | { step: 'review'; targetTier: PlanTier }
  | { step: 'processing'; targetTier: PlanTier }
  | { step: 'success'; targetTier: PlanTier; kind: 'upgrade' | 'downgrade' };

export interface SubscribeFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
  /** Required: the picker must not assume `active`. */
  lifecycle: SubscriptionState;
  /** Paid tier frozen at lapse. Used when `lifecycle === 'downgraded'`. */
  restoreTier?: PlanTier | null;
  /** Skip the picker and start at confirm-upgrade for this paid tier. */
  initialTargetTier?: PlanTier | null;
}

function initialFlowStep({
  lifecycle,
  currentTier,
  restoreTier,
  initialTargetTier,
}: {
  lifecycle: SubscriptionState;
  currentTier: PlanTier;
  restoreTier?: PlanTier | null;
  initialTargetTier?: PlanTier | null;
}): FlowStep {
  if (lifecycle === 'locked' && isValidTier(currentTier)) {
    return { step: 'reactivate', targetTier: currentTier };
  }

  if (
    (lifecycle === 'grace' || lifecycle === 'payment_failed') &&
    isValidTier(currentTier)
  ) {
    return { step: 'review', targetTier: currentTier };
  }

  if (lifecycle === 'downgraded') {
    const restore =
      restoreTier && restoreTier !== 'hobby' && isValidTier(restoreTier) ? restoreTier : null;
    if (restore) {
      return { step: 'confirm-upgrade', targetTier: restore };
    }
    return { step: 'select' };
  }

  if (
    initialTargetTier &&
    isValidTier(initialTargetTier) &&
    isUpgrade(currentTier, initialTargetTier)
  ) {
    return { step: 'confirm-upgrade', targetTier: initialTargetTier };
  }

  return { step: 'select' };
}

/**
 * E-120 Subscribe / Upgrade flow dialog.
 *
 * State machine:
 * - Upgrade:    select → confirm-upgrade → review → processing → success
 * - Downgrade:  select → confirm-downgrade → success (cancellation boundary)
 * - Paid → Hobby: treated as cancellation, NEVER enters review/pay
 * - Locked:     reactivate → review → processing → success (no plan picker)
 * - Grace / payment_failed: review current plan (no picker)
 *
 * Processing: timer-based mock. When E-116 integrates Razorpay, the processing
 * step will hand off to the Razorpay SDK and receive a callback.
 */
export function SubscribeFlowDialog({
  open,
  onOpenChange,
  currentTier,
  lifecycle,
  restoreTier = null,
  initialTargetTier = null,
}: SubscribeFlowDialogProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>(() =>
    open
      ? initialFlowStep({ lifecycle, currentTier, restoreTier, initialTargetTier })
      : { step: 'select' },
  );
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSnapshotRef = useRef({ lifecycle, currentTier, restoreTier, initialTargetTier });
  openSnapshotRef.current = { lifecycle, currentTier, restoreTier, initialTargetTier };

  // Reset / initialize when `open` changes — whether by user interaction
  // (onOpenChange) or by the parent setting open={false} directly.
  useEffect(() => {
    if (!open) {
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
      setFlowStep({ step: 'select' });
      return;
    }
    setFlowStep(initialFlowStep(openSnapshotRef.current));
  }, [open]);

  // Cleanup timer on unmount only
  useEffect(() => {
    return () => {
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
    };
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Guard: if currentTier is invalid, show error state
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
    if (lifecycle !== 'active' && lifecycle !== 'downgraded') return;
    if (targetTier === currentTier) return;
    if (isUpgrade(currentTier, targetTier)) {
      setFlowStep({ step: 'confirm-upgrade', targetTier });
    } else {
      setFlowStep({ step: 'confirm-downgrade', targetTier });
    }
  }

  function handleUpgradeConfirm(targetTier: PlanTier) {
    setFlowStep({ step: 'review', targetTier });
  }

  function handleDowngradeConfirm(targetTier: PlanTier) {
    // Downgrade/cancellation integration boundary.
    // When E-116 provides the backend API, this will call the cancellation endpoint.
    // For now, show success state to indicate the request was submitted.
    setFlowStep({ step: 'success', targetTier, kind: 'downgrade' });
  }

  function handlePay(targetTier: PlanTier) {
    setFlowStep({ step: 'processing', targetTier });
    // Mock processing — replace with Razorpay SDK handoff when E-116 is available
    processingTimerRef.current = setTimeout(() => {
      setFlowStep({ step: 'success', targetTier, kind: 'upgrade' });
      processingTimerRef.current = null;
    }, 2500);
  }

  function handleDone() {
    handleOpenChange(false);
  }

  function handleBack() {
    if (flowStep.step === 'confirm-upgrade' || flowStep.step === 'confirm-downgrade') {
      setFlowStep({ step: 'select' });
    } else if (flowStep.step === 'review') {
      const { targetTier } = flowStep;
      if (lifecycle === 'locked') {
        setFlowStep({ step: 'reactivate', targetTier });
      } else if (lifecycle === 'grace' || lifecycle === 'payment_failed') {
        handleOpenChange(false);
      } else {
        setFlowStep({ step: 'confirm-upgrade', targetTier });
      }
    }
  }

  const isProcessing = flowStep.step === 'processing';
  const isWide = flowStep.step === 'select';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={isWide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}
        showCloseButton={!isProcessing}
        onInteractOutside={isProcessing ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isProcessing ? (e) => e.preventDefault() : undefined}
      >
        <DialogTitle className="sr-only">Plan subscription</DialogTitle>

        {flowStep.step === 'select' && (
          <PlanSelectionStep currentTier={currentTier} onSelectPlan={handleSelectPlan} />
        )}
        {flowStep.step === 'reactivate' && (
          <ReactivateStep
            currentTier={currentTier}
            onConfirm={() => handleUpgradeConfirm(flowStep.targetTier)}
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
          />
        )}
        {flowStep.step === 'processing' && <ProcessingStep />}
        {flowStep.step === 'success' && (
          <SuccessStep
            targetTier={flowStep.targetTier}
            kind={flowStep.kind}
            onDone={handleDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
