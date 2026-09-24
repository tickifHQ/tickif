'use client';

import { useState } from 'react';
import type { BillingRecovery, BillingSelectionContext, PlanTier } from '@repo/contracts';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@repo/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { PLAN_MAP } from '@/lib/plan-config';
import { api } from '@/lib/api';

interface BillingStatusNoticeProps {
  context: BillingSelectionContext | null;
  currentTier: PlanTier;
  cancellationScheduled?: boolean;
  currentPeriodEnd?: string | null;
  onReview: (tier: PlanTier) => void;
  onDismissed: () => Promise<void>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

/** One authoritative status takes priority over the other billing records. */
export function BillingStatusNotice({
  context,
  currentTier,
  cancellationScheduled = false,
  currentPeriodEnd = null,
  onReview,
  onDismissed,
}: BillingStatusNoticeProps) {
  const [removing, setRemoving] = useState<Pick<
    BillingRecovery,
    'id' | 'revision' | 'targetTier'
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recovery = context?.recovery;
  const checkout = context?.unfinishedCheckout;
  const pending = context?.pendingOperation;
  const scheduled = context?.scheduledChange;
  const activeRecovery =
    recovery && !['completed', 'dismissed', 'superseded'].includes(recovery.status)
      ? recovery
      : null;
  const paymentPending = !!pending || !!checkout || activeRecovery?.status === 'checkout_pending';
  const currentLabel = PLAN_MAP[currentTier].label;
  let title: string;
  let body: string;
  let action: { label: string; tier: PlanTier } | null = null;
  let canRemove = false;
  if (pending) {
    title =
      checkout?.status === 'authenticated' ? 'Confirming payment…' : 'Confirming plan change…';
    body = `We are checking your ${PLAN_MAP[pending.targetTier].label} ${checkout?.status === 'authenticated' ? 'payment' : 'plan change'}.`;
  } else if (checkout) {
    title = checkout.status === 'authenticated' ? 'Confirming payment…' : 'Checkout in progress';
    body = checkout.targetTier
      ? `${PLAN_MAP[checkout.targetTier].label} is selected.`
      : 'Your checkout details are being confirmed.';
    if (checkout.status === 'created' && checkout.targetTier)
      action = { label: 'Continue checkout', tier: checkout.targetTier };
  } else if (activeRecovery) {
    const targetLabel = PLAN_MAP[activeRecovery.targetTier].label;
    const end = activeRecovery.eligibleAt ?? currentPeriodEnd;
    title =
      activeRecovery.status === 'checkout_pending' ? 'Confirming payment…' : `${targetLabel} saved`;
    if (activeRecovery.status === 'eligible') {
      body = `Your previous subscription has ended. You can now purchase ${targetLabel}.`;
      action = { label: `Review ${targetLabel}`, tier: activeRecovery.targetTier };
    } else if (activeRecovery.status === 'checkout_pending') {
      body = `We are checking your ${targetLabel} checkout.`;
    } else if (activeRecovery.status === 'requested') {
      body = `${currentLabel} stays active while cancellation is confirmed.`;
    } else {
      body = end
        ? `${currentLabel} stays active until ${formatDate(end)}. You can purchase ${targetLabel} after it ends.`
        : `${currentLabel} stays active until your subscription ends. The end date is not yet confirmed. You can purchase ${targetLabel} after it ends.`;
    }
    canRemove = !paymentPending;
  } else if (scheduled || cancellationScheduled) {
    title = cancellationScheduled ? 'Cancellation scheduled' : 'Plan change scheduled';
    const end = scheduled?.effectiveAt ?? currentPeriodEnd;
    const targetLabel = scheduled?.targetTier
      ? PLAN_MAP[scheduled.targetTier].label
      : cancellationScheduled
        ? 'Hobby'
        : null;
    body = end
      ? `${currentLabel} stays active until ${formatDate(end)}. ${targetLabel ? `Your plan changes to ${targetLabel} after it ends.` : 'The new plan is awaiting confirmation.'}`
      : `${currentLabel} stays active until the scheduled change. The effective date is not yet confirmed.`;
    if (!end && !targetLabel) body += ' The new plan is awaiting confirmation.';
  } else return null;

  const unchanged =
    !!removing &&
    recovery?.id === removing.id &&
    recovery.revision === removing.revision &&
    canRemove;
  return (
    <>
      <Alert className="mt-4" role="status" aria-label="Billing status">
        <div className="col-start-2 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription>
              <p>{body}</p>
              {action && (
                <Button variant="outline" onClick={() => onReview(action.tier)}>
                  {action.label}
                </Button>
              )}
            </AlertDescription>
          </div>
          {canRemove && activeRecovery && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Saved plan options">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (removing) event.preventDefault();
                }}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      setError(null);
                      setRemoving({
                        id: activeRecovery.id,
                        revision: activeRecovery.revision,
                        targetTier: activeRecovery.targetTier,
                      });
                    }}
                  >
                    Remove saved plan
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Alert>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={!busy}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={busy ? (event) => event.preventDefault() : undefined}
        >
          <DialogTitle>Remove saved plan?</DialogTitle>
          <DialogDescription>
            Removing this selection does not undo a scheduled cancellation or plan change.
          </DialogDescription>
          {!unchanged && (
            <p role="alert">
              Your saved plan changed. Close this confirmation and review the latest billing status.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRemoving(null)}>
              Keep saved plan
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !unchanged}
              onClick={async () => {
                if (!removing || !unchanged || busy) return;
                setBusy(true);
                setError(null);
                try {
                  const response = await api.api.billing.recovery.dismiss.$post({
                    json: { expectedRecoveryId: removing.id, expectedRevision: removing.revision },
                  });
                  if (!response.ok)
                    throw new Error(
                      'Unable to remove this saved plan. Its details may have changed.',
                    );
                  setRemoving(null);
                  await onDismissed();
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : 'Unable to remove this saved plan.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Removing…' : 'Remove saved plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
