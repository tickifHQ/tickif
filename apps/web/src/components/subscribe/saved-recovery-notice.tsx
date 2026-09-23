'use client';

import { useState } from 'react';
import type { BillingRecovery, BillingSelectionContext, PlanTier } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { PLAN_MAP } from '@/lib/plan-config';
import { api } from '@/lib/api';
import { reasonLabel } from './billing-reason';

const savedPlanStatus: Record<BillingRecovery['status'], string> = {
  requested: 'Confirming cancellation',
  waiting_for_expiry: 'Waiting for your current plan to end',
  eligible: 'Ready to purchase',
  checkout_pending: 'Checkout in progress',
  completed: 'Plan activated',
  dismissed: 'Selection removed',
  superseded: 'Selection replaced',
};

export function PendingBillingNotice({
  context,
  onReview,
}: {
  context: BillingSelectionContext | null;
  onReview: (tier: PlanTier) => void;
}) {
  if (!context) return null;
  const { pendingOperation, scheduledChange, unfinishedCheckout } = context;
  if (!pendingOperation && !scheduledChange && !unfinishedCheckout) return null;
  return (
    <Alert className="mt-4">
      <AlertTitle>Billing change in progress</AlertTitle>
      <AlertDescription>
        {pendingOperation && (
          <p>
            {PLAN_MAP[pendingOperation.targetTier].label}: we are checking your billing change. This
            status updates automatically.
          </p>
        )}
        {scheduledChange && (
          <p>
            {scheduledChange.targetTier
              ? PLAN_MAP[scheduledChange.targetTier].label
              : 'Plan change'}{' '}
            is scheduled for{' '}
            {scheduledChange.effectiveAt
              ? new Date(scheduledChange.effectiveAt).toLocaleDateString('en-IN')
              : 'a date that is not yet confirmed'}
            . Your current access remains until the verified change.
          </p>
        )}
        {unfinishedCheckout && (
          <p>
            {unfinishedCheckout.targetTier
              ? PLAN_MAP[unfinishedCheckout.targetTier].label
              : 'An unknown plan'}{' '}
            has an unfinished checkout.{' '}
            {unfinishedCheckout.status === 'authenticated'
              ? 'Activation is pending; do not purchase again.'
              : 'Review this checkout before continuing.'}
          </p>
        )}
        {unfinishedCheckout?.status === 'created' && unfinishedCheckout.targetTier && (
          <Button
            variant="outline"
            onClick={() => {
              if (unfinishedCheckout.targetTier) onReview(unfinishedCheckout.targetTier);
            }}
          >
            Review {PLAN_MAP[unfinishedCheckout.targetTier].label} checkout
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function SavedRecoveryNotice({
  recovery,
  onReview,
  onDismissed,
}: {
  recovery: BillingRecovery | null | undefined;
  onReview: (tier: PlanTier) => void;
  onDismissed: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!recovery) return null;
  const terminal = ['completed', 'dismissed', 'superseded'].includes(recovery.status);
  return (
    <Alert className="mt-4">
      <AlertTitle>Saved plan: {PLAN_MAP[recovery.targetTier].label}</AlertTitle>
      <AlertDescription>
        <p>{savedPlanStatus[recovery.status]}.</p>
        {!terminal && (
          <p>
            {recovery.status === 'eligible'
              ? 'Review your selected plan to continue to payment. Nothing is purchased automatically.'
              : recovery.status === 'checkout_pending'
                ? 'Your selected plan already has a checkout. Review its status before continuing; do not start another purchase while activation is pending.'
                : recovery.eligibleAt
                  ? `You can continue after ${new Date(recovery.eligibleAt).toLocaleDateString('en-IN')}, once your previous subscription has ended.`
                  : 'Your previous subscription’s end date is not yet confirmed.'}
            {(recovery.status === 'requested' || recovery.status === 'waiting_for_expiry') &&
              ' You will need to confirm a new purchase. Nothing is purchased automatically.'}
          </p>
        )}
        {recovery.reason && <p>{reasonLabel(recovery.reason)}</p>}
        {!terminal && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => onReview(recovery.targetTier)}>
              Review plan
            </Button>
            <p>Removing this selection does not undo a scheduled cancellation or plan change.</p>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const response = await api.api.billing.recovery.dismiss.$post({
                    json: { expectedRevision: recovery.revision },
                  });
                  if (!response.ok)
                    throw new Error(
                      'Unable to remove this selection. Billing details are being checked automatically; please try again shortly.',
                    );
                  await onDismissed();
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : 'Unable to remove this selection.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove saved plan
            </Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </AlertDescription>
    </Alert>
  );
}
