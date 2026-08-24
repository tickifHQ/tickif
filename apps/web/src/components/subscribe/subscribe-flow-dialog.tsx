'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@repo/ui/components/dialog';
import type { PlanTier } from '@/lib/plan-config';
import { isUpgrade, isValidTier } from '@/lib/plan-config';
import { PlanSelectionStep } from './plan-selection-step';
import { UpgradeConfirmationStep } from './upgrade-confirmation-step';
import { DowngradeConfirmationStep } from './downgrade-confirmation-step';
import { ReviewPayStep } from './review-pay-step';
import { ProcessingStep } from './processing-step';
import { SuccessStep } from './success-step';

type FlowStep =
  | { step: 'select' }
  | { step: 'confirm-upgrade'; targetTier: PlanTier }
  | { step: 'confirm-downgrade'; targetTier: PlanTier }
  | { step: 'review'; targetTier: PlanTier }
  | { step: 'processing'; targetTier: PlanTier }
  | { step: 'success'; targetTier: PlanTier }
  | { step: 'error' };

interface SubscribeFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
}

/**
 * E-120 Subscribe / Upgrade flow dialog.
 *
 * State machine:
 * - Upgrade:    select → confirm-upgrade → review → processing → success
 * - Downgrade:  select → confirm-downgrade → (done — integration boundary for E-116)
 * - Paid → Hobby: treated as cancellation, NEVER enters review/pay
 *
 * Processing: timer-based mock. When E-116 integrates Razorpay, the processing
 * step will hand off to the Razorpay SDK and receive a callback.
 */
export function SubscribeFlowDialog({
  open,
  onOpenChange,
  currentTier,
}: SubscribeFlowDialogProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>({ step: 'select' });
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // Track mount state for safe timer callbacks
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Clean up processing timer on unmount or step change
  useEffect(() => {
    return () => {
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
    };
  }, [flowStep]);

  // Reset to select whenever dialog closes
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Clear any active processing timer
        if (processingTimerRef.current) {
          clearTimeout(processingTimerRef.current);
          processingTimerRef.current = null;
        }
        // Reset state immediately (dialog handles exit animation internally)
        setFlowStep({ step: 'select' });
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  // Guard: if currentTier is invalid, show error state
  if (!isValidTier(currentTier)) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle className="sr-only">Plan Selection</DialogTitle>
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
    } else {
      setFlowStep({ step: 'confirm-downgrade', targetTier });
    }
  }

  function handleUpgradeConfirm(targetTier: PlanTier) {
    setFlowStep({ step: 'review', targetTier });
  }

  function handleDowngradeConfirm() {
    // Downgrade/cancellation is an integration boundary.
    // When E-116 provides the backend, this will call the cancellation/downgrade API.
    // For now, transition to success to demonstrate the flow.
    // In production, this would be an API call, not a payment.
    handleOpenChange(false);
  }

  function handlePay(targetTier: PlanTier) {
    setFlowStep({ step: 'processing', targetTier });
    // Mock processing — replace with Razorpay SDK handoff when E-116 is available
    processingTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setFlowStep({ step: 'success', targetTier });
      }
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
      setFlowStep({ step: 'confirm-upgrade', targetTier });
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
            onConfirm={handleDowngradeConfirm}
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
          <SuccessStep targetTier={flowStep.targetTier} onDone={handleDone} />
        )}
      </DialogContent>
    </Dialog>
  );
}
