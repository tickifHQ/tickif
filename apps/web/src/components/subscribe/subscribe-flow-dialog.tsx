'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@repo/ui/components/dialog';
import type { PlanTier } from '@/lib/plan-config';
import { isUpgrade } from '@/lib/plan-config';
import { PlanSelectionStep } from './plan-selection-step';
import { UpgradeConfirmationStep } from './upgrade-confirmation-step';
import { DowngradeConfirmationStep } from './downgrade-confirmation-step';
import { ReviewPayStep } from './review-pay-step';
import { ProcessingStep } from './processing-step';
import { SuccessStep } from './success-step';

type FlowStep =
  | { step: 'select' }
  | { step: 'confirm'; direction: 'upgrade' | 'downgrade'; targetTier: PlanTier }
  | { step: 'review'; targetTier: PlanTier }
  | { step: 'processing'; targetTier: PlanTier }
  | { step: 'success'; targetTier: PlanTier };

interface SubscribeFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
}

/**
 * E-120 Subscribe / Upgrade flow dialog.
 *
 * Manages the multi-step plan selection → confirmation → review → processing → success flow.
 * Entirely client-side mock state for now. When the billing backend is available,
 * the "processing" step will integrate with Razorpay and the subscription API.
 */
export function SubscribeFlowDialog({
  open,
  onOpenChange,
  currentTier,
}: SubscribeFlowDialogProps) {
  const [flowStep, setFlowStep] = useState<FlowStep>({ step: 'select' });

  function handleSelectPlan(targetTier: PlanTier) {
    if (targetTier === currentTier) return;
    const direction = isUpgrade(currentTier, targetTier) ? 'upgrade' : 'downgrade';
    setFlowStep({ step: 'confirm', direction, targetTier });
  }

  function handleConfirm(targetTier: PlanTier) {
    setFlowStep({ step: 'review', targetTier });
  }

  function handlePay(targetTier: PlanTier) {
    setFlowStep({ step: 'processing', targetTier });
    // Simulate processing — replace with real backend call later
    setTimeout(() => {
      setFlowStep({ step: 'success', targetTier });
    }, 2500);
  }

  function handleDone() {
    onOpenChange(false);
    // Reset to selection after close animation
    setTimeout(() => setFlowStep({ step: 'select' }), 300);
  }

  function handleBack() {
    if (flowStep.step === 'confirm') {
      setFlowStep({ step: 'select' });
    } else if (flowStep.step === 'review') {
      const { targetTier } = flowStep;
      const direction = isUpgrade(currentTier, targetTier) ? 'upgrade' : 'downgrade';
      setFlowStep({ step: 'confirm', direction, targetTier });
    }
  }

  // Wider dialog for plan selection, standard for other steps
  const isWide = flowStep.step === 'select';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={isWide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}
        showCloseButton={flowStep.step !== 'processing'}
      >
        {flowStep.step === 'select' && (
          <PlanSelectionStep
            currentTier={currentTier}
            onSelectPlan={handleSelectPlan}
          />
        )}
        {flowStep.step === 'confirm' && flowStep.direction === 'upgrade' && (
          <UpgradeConfirmationStep
            currentTier={currentTier}
            targetTier={flowStep.targetTier}
            onConfirm={() => handleConfirm(flowStep.targetTier)}
            onBack={handleBack}
          />
        )}
        {flowStep.step === 'confirm' && flowStep.direction === 'downgrade' && (
          <DowngradeConfirmationStep
            currentTier={currentTier}
            targetTier={flowStep.targetTier}
            onConfirm={() => handleConfirm(flowStep.targetTier)}
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
        {flowStep.step === 'processing' && (
          <ProcessingStep />
        )}
        {flowStep.step === 'success' && (
          <SuccessStep
            targetTier={flowStep.targetTier}
            onDone={handleDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
