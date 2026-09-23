'use client';

import { useState } from 'react';
import type { BillingRecovery, BillingSelectionContext, PlanTier } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import { PLAN_MAP } from '@/lib/plan-config';
import { api } from '@/lib/api';
import { reasonLabel } from './billing-reason';

export function PendingBillingNotice({
  context,
  onReview,
  onRefresh,
}: {
  context: BillingSelectionContext | null;
  onReview: (tier: PlanTier) => void;
  onRefresh: () => Promise<void>;
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
            {PLAN_MAP[pendingOperation.targetTier].label}: the provider outcome is being reconciled.
            Refresh status before trying again.
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
        <Button variant="outline" onClick={() => void onRefresh()}>
          Refresh billing status
        </Button>
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
      <AlertTitle>Saved recovery: {PLAN_MAP[recovery.targetTier].label}</AlertTitle>
      <AlertDescription>
        <p>Status: {recovery.status.replaceAll('_', ' ')}.</p>
        {!terminal && (
          <p>
            {recovery.eligibleAt
              ? `Eligibility will be verified after ${new Date(recovery.eligibleAt).toLocaleDateString('en-IN')}.`
              : 'The next eligible date is not yet confirmed.'}{' '}
            Checkout always requires your confirmation.
          </p>
        )}
        {recovery.reason && <p>{reasonLabel(recovery.reason)}</p>}
        {!terminal && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => onReview(recovery.targetTier)}>
              Review saved recovery
            </Button>
            <p>
              Dismissing this saved target does not undo an existing cancellation or scheduled plan
              change.
            </p>
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
                      'The recovery changed or could not be dismissed. Refresh billing and review it again.',
                    );
                  await onDismissed();
                } catch (failure) {
                  setError(
                    failure instanceof Error ? failure.message : 'Unable to dismiss recovery.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Dismiss saved target
            </Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </AlertDescription>
    </Alert>
  );
}
