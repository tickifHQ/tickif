'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@repo/ui/components/dialog';
import { Button } from '@repo/ui/components/button';
import type {
  BillingChangePreview,
  BillingRecovery,
  PlanTier,
  SubscriptionState,
} from '@repo/contracts';
import {
  billingChangePreviewSchema,
  billingRecoveryResponseSchema,
  billingMutationOutcomeSchema,
  billingSubscribeOutcomeSchema,
  billingSelectionContextSchema,
  subscriptionResponseSchema,
} from '@repo/contracts';
import { isUpgrade, isValidTier, PLAN_MAP } from '@/lib/plan-config';
import { PlanSelection } from './plan-selection';
import { api } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { reasonLabel } from './billing-reason';
import { useBillingAutoRefresh } from './use-billing-auto-refresh';
import { ReplacementCheckout } from './replacement-checkout';

interface CheckoutFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: PlanTier;
  lifecycleState: SubscriptionState;
  cancellationScheduled: boolean;
  currentPeriodEnd: string | null;
  restoreTier?: PlanTier | null;
  initialTargetTier?: PlanTier | null;
  onTargetChange?: (tier: PlanTier | null) => void;
  scopeKey?: string;
  onSubscriptionChange?: () => void | Promise<void>;
}

type Step =
  | 'replacement'
  | 'select'
  | 'loading'
  | 'review'
  | 'processing'
  | 'pending'
  | 'error'
  | 'scheduled'
  | 'activated'
  | 'recovery';

function dateLabel(value: string | null) {
  if (!value) return 'Not yet confirmed';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}
function money(value: number | null, currency: string | null) {
  if (value === null || !currency) return 'Not yet confirmed';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value / 100);
}
/** Every entry point obtains the same server preview; only explicit confirmation mutates billing. */
export function CheckoutFlow(props: CheckoutFlowProps) {
  return <ScopedCheckoutFlow key={props.scopeKey} {...props} />;
}
function ScopedCheckoutFlow({
  open,
  onOpenChange,
  currentTier,
  lifecycleState,
  restoreTier = null,
  initialTargetTier = null,
  onTargetChange,
  onSubscriptionChange,
}: CheckoutFlowProps) {
  const [target, setTarget] = useState<PlanTier | null>(initialTargetTier);
  const [step, setStep] = useState<Step>('select');
  const [preview, setPreview] = useState<BillingChangePreview | null>(null);
  const [recovery, setRecovery] = useState<BillingRecovery | null>(null);
  const [message, setMessage] = useState('');
  const [effectiveAt, setEffectiveAt] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [checkoutDismissed, setCheckoutDismissed] = useState(false);
  const operationId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const externalCheckout = useRef(false);
  const previousInput = useRef<{ open: boolean; target: PlanTier | null }>({
    open: false,
    target: null,
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  const syncStatus = useCallback(async () => {
    if (!target || !preview) return;
    const request = sequence.current;
    if (onSubscriptionChange) await onSubscriptionChange();
    else {
      const refreshed = await api.api.billing.subscription.refresh.$get();
      if (!refreshed.ok) throw new Error('Billing confirmation is temporarily unavailable.');
    }
    if (!mounted.current || request !== sequence.current) return;
    const [subscriptionResponse, contextResponse] = await Promise.all([
      api.api.billing.subscription.$get(),
      api.api.billing['selection-context'].$get(),
    ]);
    if (!subscriptionResponse.ok || !contextResponse.ok)
      throw new Error('Billing confirmation is temporarily unavailable.');
    const [subscriptionJson, contextJson] = await Promise.all([
      subscriptionResponse.json(),
      contextResponse.json(),
    ]);
    const subscription = subscriptionResponseSchema.safeParse(subscriptionJson);
    const context = billingSelectionContextSchema.safeParse(contextJson);
    if (
      !subscription.success ||
      !context.success ||
      context.data.organizationId !== preview.organizationId
    )
      throw new Error('Billing confirmation could not be verified.');
    if (!mounted.current || request !== sequence.current) return;
    const saved = context.data.recovery;
    const sameRecovery =
      !!recovery &&
      !!saved &&
      saved.id === recovery.id &&
      saved.sourceSubscriptionId === recovery.sourceSubscriptionId &&
      saved.targetTier === target;
    const recoveredLostResponse =
      !recovery &&
      preview.action === 'recover' &&
      !!saved &&
      saved.organizationId === preview.organizationId &&
      saved.targetTier === target &&
      saved.sourceSubscriptionId === preview.sourceSubscriptionId;
    // A concurrent billing user may replace the recovery intent. Never adopt their target.
    if (recovery && !sameRecovery) {
      setMessage(
        'Your saved plan changed elsewhere. Close this dialog to review the latest billing details.',
      );
      return;
    }
    if (sameRecovery && saved.revision < recovery.revision) return;
    if (sameRecovery || recoveredLostResponse) {
      setRecovery(saved);
      setMessage('');
      setStep('recovery');
    }
    if (
      context.data.currentTier === target &&
      context.data.providerState === 'known' &&
      !context.data.pendingOperation &&
      !context.data.unfinishedCheckout &&
      subscription.data.tier === target &&
      (subscription.data.lifecycleState === 'active' ||
        (target === 'hobby' && subscription.data.lifecycleState === 'downgraded')) &&
      (preview.action !== 'recover' ||
        ((sameRecovery || recoveredLostResponse) && saved?.status === 'completed'))
    ) {
      setMessage('');
      setStep('activated');
    } else if (
      context.data.scheduledChange?.targetTier === target ||
      (target === 'hobby' && subscription.data.cancellationScheduled)
    ) {
      setEffectiveAt(
        context.data.scheduledChange?.effectiveAt ?? subscription.data.currentPeriodEnd,
      );
      setStep('scheduled');
    }
  }, [onSubscriptionChange, preview, recovery, target]);
  useBillingAutoRefresh(syncStatus, {
    enabled:
      open &&
      !providerOpen &&
      !!target &&
      !!preview &&
      (step === 'pending' ||
        step === 'recovery' ||
        step === 'scheduled' ||
        (step === 'error' && operationId.current !== null)),
    urgent:
      step === 'pending' ||
      step === 'error' ||
      recovery?.status === 'requested' ||
      recovery?.status === 'checkout_pending',
  });

  const review = useCallback(async (tier: PlanTier) => {
    const request = ++sequence.current;
    setTarget(tier);
    setStep('loading');
    setPreview(null);
    setRecovery(null);
    setCheckoutDismissed(false);
    setMessage('');
    operationId.current = null;
    try {
      const response = await api.api.billing['change-preview'].$post({
        json: { targetTier: tier },
      });
      if (!mounted.current || request !== sequence.current) return;
      if (!response.ok) throw new Error('Unable to verify this plan change. Please try again.');
      const parsed = billingChangePreviewSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.targetTier !== tier)
        throw new Error('Unable to verify the selected plan.');
      if (!mounted.current || request !== sequence.current) return;
      setPreview(parsed.data);
      if (parsed.data.action === 'recover' || parsed.data.action === 'subscribe') {
        const recoveryResponse = await api.api.billing.recovery.$get();
        if (!recoveryResponse.ok)
          throw new Error('Unable to load your saved plan. Please try again.');
        const saved = billingRecoveryResponseSchema.safeParse(await recoveryResponse.json());
        if (!saved.success) throw new Error('Unable to check your saved plan. Please try again.');
        if (!mounted.current || request !== sequence.current) return;
        setRecovery(
          parsed.data.action === 'recover' ||
            (saved.data.recovery?.status === 'eligible' && saved.data.recovery.targetTier !== tier)
            ? saved.data.recovery
            : null,
        );
      }
      setStep('review');
    } catch (error) {
      if (mounted.current && request === sequence.current) {
        setMessage(error instanceof Error ? error.message : 'Unable to load billing.');
        setStep('error');
      }
    }
  }, []);

  useEffect(() => {
    const needsReview =
      open &&
      (!previousInput.current.open ||
        (initialTargetTier !== null && previousInput.current.target !== initialTargetTier));
    previousInput.current = { open, target: initialTargetTier };
    if (!needsReview || externalCheckout.current || !isValidTier(currentTier)) return;
    const tier = initialTargetTier ?? (lifecycleState === 'downgraded' ? restoreTier : null);
    if (tier) void review(tier);
    else setStep('select');
    // A fresh explicit opening always revalidates; server subscription refresh must not resubmit.
  }, [open, initialTargetTier, currentTier, lifecycleState, restoreTier, review]);

  function choose(tier: PlanTier) {
    onTargetChange?.(tier);
    void review(tier);
  }
  async function failResponse(response: { json: () => Promise<unknown> }) {
    const data = await response.json().catch(() => null);
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    if (code === 'preview_stale' || code === 'recovery_revision_conflict') {
      operationId.current = null;
      throw new Error('Billing details changed. Review the selected plan again before confirming.');
    }
    throw new Error(
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unable to complete the request. We are checking billing status automatically.',
    );
  }
  async function confirm() {
    if (!preview || !target || inFlight.current || !preview.confirmationAllowed) return;
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      setMessage('Billing details expired. Review the selected plan again before confirming.');
      setStep('error');
      return;
    }
    inFlight.current = true;
    operationId.current ??= crypto.randomUUID();
    const json = {
      targetTier: target,
      previewToken: preview.previewToken,
      operationId: operationId.current,
    };
    setStep('processing');
    let acknowledged = false;
    try {
      const replacingSavedPlan =
        preview.action === 'subscribe' &&
        recovery?.status === 'eligible' &&
        recovery.targetTier !== target;
      if (preview.action === 'recover' || replacingSavedPlan) {
        const response = await api.api.billing.recovery.$post({
          json: {
            ...json,
            expectedRecoveryId: recovery?.id ?? null,
            expectedRevision: recovery?.revision ?? null,
          },
        });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        const data = billingRecoveryResponseSchema.safeParse(await response.json());
        if (!data.success)
          throw new Error(
            'Your saved plan could not be confirmed yet. We are checking automatically.',
          );
        if (!mounted.current) return;
        if (replacingSavedPlan) {
          // Replacing a selection never purchases it. Obtain a new review and
          // operation ID before the user separately confirms payment.
          await review(target);
          onSubscriptionChange?.();
          return;
        }
        setRecovery(data.data.recovery);
        setStep('recovery');
        onSubscriptionChange?.();
      } else if (preview.action === 'change_plan') {
        const response = await api.api.billing['change-plan'].$post({ json });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        setStep('replacement');
      } else if (preview.action === 'subscribe') {
        const response = await api.api.billing.subscribe.$post({ json });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        const parsedCheckout = billingSubscribeOutcomeSchema.safeParse(await response.json());
        if (!mounted.current) return;
        if (!parsedCheckout.success || parsedCheckout.data.targetTier !== target) {
          setMessage(
            'Checkout details could not be verified. We are checking billing status automatically.',
          );
          setStep('pending');
          return;
        }
        const data = parsedCheckout.data;
        if (data.outcome === 'reconciliation_pending' || data.outcome === 'failed') {
          setMessage('We are checking your checkout. This status updates automatically.');
          setStep('pending');
          return;
        }
        onSubscriptionChange?.();
        externalCheckout.current = true;
        setProviderOpen(true);
        onOpenChange(false);
        await openRazorpayCheckout({
          keyId: data.razorpayKeyId,
          subscriptionId: data.razorpaySubscriptionId,
          targetTier: target,
          prefill: data.prefill,
          onDismiss: () => {
            if (!mounted.current) return;
            externalCheckout.current = false;
            setProviderOpen(false);
            setCheckoutDismissed(true);
            setMessage(`Checkout closed. ${PLAN_MAP[target].label} is still selected.`);
            setStep('error');
            previousInput.current = { open: true, target: initialTargetTier };
            onOpenChange(true);
          },
          onSuccess: async (payment) => {
            if (!mounted.current) return;
            setProviderOpen(false);
            onOpenChange(true);
            setStep('pending');
            try {
              const response = await api.api.billing['verify-payment'].$post({
                json: {
                  razorpayPaymentId: payment.razorpay_payment_id,
                  razorpaySubscriptionId: payment.razorpay_subscription_id,
                  razorpaySignature: payment.razorpay_signature,
                },
              });
              if (!response.ok)
                throw new Error(
                  'Payment verification is pending. This status updates automatically.',
                );
              if (!mounted.current) return;
              await onSubscriptionChange?.();
            } catch (error) {
              if (mounted.current) {
                setMessage(error instanceof Error ? error.message : 'Payment status is pending.');
                setStep('pending');
              }
            } finally {
              externalCheckout.current = false;
            }
          },
        });
      } else {
        const response =
          preview.action === 'cancel'
            ? await api.api.billing.cancel.$post({ json })
            : await api.api.billing['change-plan'].$post({ json });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        const parsedOutcome = billingMutationOutcomeSchema.safeParse(await response.json());
        if (!mounted.current) return;
        if (!parsedOutcome.success) {
          setMessage('We could not confirm this change. This status updates automatically.');
          setStep('pending');
          return;
        }
        const data = parsedOutcome.data;
        setEffectiveAt(data.effectiveAt);
        setStep(
          data.outcome === 'activated'
            ? 'activated'
            : data.outcome === 'scheduled'
              ? 'scheduled'
              : data.outcome === 'failed'
                ? 'error'
                : 'pending',
        );
        if (data.outcome === 'failed')
          setMessage('The plan change failed. Your current access is being checked automatically.');
        onSubscriptionChange?.();
      }
    } catch (error) {
      if (mounted.current) {
        externalCheckout.current = false;
        setProviderOpen(false);
        previousInput.current = { open: true, target: initialTargetTier };
        onOpenChange(true);
        setMessage(error instanceof Error ? error.message : 'Unable to complete billing request.');
        setStep(acknowledged ? 'error' : 'pending');
      }
    } finally {
      inFlight.current = false;
    }
  }
  const label = target ? PLAN_MAP[target].label : '';
  const replacingSavedPlan =
    preview?.action === 'subscribe' &&
    recovery?.status === 'eligible' &&
    recovery.targetTier !== target;
  const blocking = step === 'processing';
  const title =
    target === 'hobby'
      ? 'Switch to Hobby'
      : target === currentTier && preview?.action === 'subscribe'
        ? `Subscribe to ${label}`
        : target && isUpgrade(currentTier, target)
          ? `Upgrade to ${label}`
          : `Downgrade to ${label}`;
  return (
    <Dialog
      open={open}
      modal={!providerOpen}
      onOpenChange={(value) => {
        if (!blocking && !providerOpen) onOpenChange(value);
      }}
    >
      <DialogContent
        className={step === 'select' ? 'sm:max-w-5xl' : 'sm:max-w-lg'}
        showCloseButton={!blocking}
        onInteractOutside={blocking ? (event) => event.preventDefault() : undefined}
        onEscapeKeyDown={blocking ? (event) => event.preventDefault() : undefined}
      >
        <DialogTitle className="sr-only">Plan subscription</DialogTitle>
        {!isValidTier(currentTier) ? (
          <p>
            Unable to load plan information. Please{' '}
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              contact support
            </a>
            .
          </p>
        ) : (
          <>
            {step === 'select' && (
              <PlanSelection
                currentTier={currentTier}
                lifecycleState={lifecycleState}
                selectedTier={target}
                onSelectPlan={choose}
              />
            )}
            {(step === 'loading' || step === 'processing') && (
              <p role="status">
                {step === 'loading' ? 'Checking your plan…' : 'Updating your billing…'}
              </p>
            )}
            {step === 'review' && preview && (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  Selected plan: {label}. Current plan: {PLAN_MAP[preview.currentTier].label}.
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <dt>Effective date</dt>
                  <dd>
                    {preview.timing === 'now' ? 'Once confirmed' : dateLabel(preview.effectiveAt)}
                  </dd>
                  <dt>Next renewal</dt>
                  <dd>{dateLabel(preview.nextRenewalAt)}</dd>
                  <dt>Monthly price</dt>
                  <dd>{money(preview.recurringAmount, preview.currency)}</dd>
                  <dt>
                    {preview.adjustmentDirection === 'refund' ? 'Refund' : 'Additional charge'}
                  </dt>
                  <dd>
                    {money(preview.adjustmentAmount, preview.currency)}
                    {preview.amountCertainty === 'estimated' ? ' (estimate)' : ''}
                  </dd>
                </dl>
                {preview.action === 'change_plan' && (
                  <p className="text-sm text-muted-foreground">
                    Authorize future renewals in checkout. Any upgrade adjustment shown above is a
                    separate payment. Downgrades retain your current plan until the renewal date.
                    Your bank may show a refundable mandate authorization charge.
                  </p>
                )}
                {preview.action === 'subscribe' && (
                  <p className="text-sm text-muted-foreground">
                    Review the final recurring amount and payment authorization in Razorpay
                    Checkout. Monthly display pricing is not today’s charge.
                  </p>
                )}
                {replacingSavedPlan && recovery && (
                  <p className="text-sm">
                    This replaces your saved {PLAN_MAP[recovery.targetTier].label} plan with {label}
                    . No payment is made yet.
                  </p>
                )}
                {(preview.reason ||
                  preview.action === 'recover' ||
                  preview.action === 'blocked') && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {reasonLabel(preview.reason)} Next eligible date:{' '}
                    {dateLabel(preview.nextEligibleAt)}.
                  </p>
                )}
                {preview.action === 'recover' && preview.reason !== 'cancellation_scheduled' && (
                  <p className="text-sm">
                    Confirming schedules cancellation of your current paid subscription at the end
                    of its billing period and saves {label} for a future checkout. Your current
                    access continues until your subscription ends. No replacement subscription is
                    purchased now.
                  </p>
                )}
                {recovery && preview.action === 'recover' && (
                  <p className="text-sm">
                    Previously selected: {PLAN_MAP[recovery.targetTier].label}. This will be
                    replaced with {label}.
                  </p>
                )}
                {preview.confirmationAllowed && (
                  <Button onClick={() => void confirm()}>
                    {replacingSavedPlan
                      ? `Choose ${label}`
                      : preview.action === 'subscribe'
                        ? 'Continue to payment'
                        : preview.action === 'cancel'
                          ? 'Schedule cancellation'
                          : preview.action === 'recover'
                            ? preview.reason === 'cancellation_scheduled'
                              ? 'Save plan'
                              : 'Cancel & save plan'
                            : 'Confirm plan change'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (preview.confirmationAllowed) setStep('select');
                    else onOpenChange(false);
                  }}
                >
                  {preview.confirmationAllowed ? 'Choose another plan' : 'Close'}
                </Button>
              </div>
            )}
            {step === 'replacement' && (
              <ReplacementCheckout
                onProviderOpen={setProviderOpen}
                onChange={() => {
                  void syncStatus();
                }}
              />
            )}
            {step === 'recovery' && (
              <div className="flex flex-col gap-4" role="status">
                <h2 className="text-lg font-semibold">Plan saved</h2>
                <p>
                  {recovery?.status === 'waiting_for_expiry'
                    ? recovery.eligibleAt
                      ? `${PLAN_MAP[preview?.currentTier ?? currentTier].label} stays active until ${dateLabel(recovery.eligibleAt)}. You can purchase ${label} after it ends.`
                      : `You can purchase ${label} after your current subscription ends. Its end date is not yet confirmed.`
                    : recovery?.status === 'eligible'
                      ? 'The previous subscription has ended. Review your selected plan to continue checkout.'
                      : recovery?.status === 'checkout_pending'
                        ? 'Your checkout is being confirmed. Please wait before making another purchase.'
                        : recovery?.status === 'dismissed' || recovery?.status === 'superseded'
                          ? 'This saved selection is no longer active. Close this dialog to review your available plans.'
                          : 'Your cancellation is being confirmed. You can purchase your saved plan after your current subscription ends.'}
                </p>
                {message && <p>{message}</p>}
                {recovery?.status === 'eligible' && !message && target && (
                  <Button onClick={() => void review(target)}>Review {label}</Button>
                )}
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            )}
            {step === 'error' && (
              <div className="flex flex-col gap-4">
                <p role="alert">{message}</p>
                {target && (
                  <Button onClick={() => void review(target)}>
                    {checkoutDismissed ? 'Continue checkout' : `Retry ${label}`}
                  </Button>
                )}
                {operationId.current ? (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setStep('select')}>
                    Choose another plan
                  </Button>
                )}
              </div>
            )}
            {step === 'pending' && (
              <div className="flex flex-col gap-4" role="status">
                <h2 className="text-lg font-semibold">Confirmation pending</h2>
                <p>
                  {label} remains selected.{' '}
                  {message ||
                    'This change is still being confirmed. Your access will update once confirmed.'}
                </p>
                <p className="text-sm text-muted-foreground">
                  We’ll keep checking automatically. You can close this dialog while confirmation is
                  pending.
                </p>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            )}
            {(step === 'scheduled' || step === 'activated') && target && (
              <SuccessStep
                targetTier={target}
                kind={step === 'activated' ? 'activated' : 'downgrade'}
                effectiveAt={effectiveAt}
                onDone={() => {
                  onOpenChange(false);
                  onSubscriptionChange?.();
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SuccessStep({
  targetTier,
  kind,
  effectiveAt = null,
  onDone,
}: {
  targetTier: PlanTier;
  kind: 'upgrade' | 'downgrade' | 'activated';
  effectiveAt?: string | null;
  onDone: () => void;
}) {
  return (
    <div role="status" className="flex flex-col gap-4 py-8 text-center">
      <h2 className="text-lg font-semibold">
        {kind === 'activated' ? 'Plan activated' : 'Plan change scheduled'}
      </h2>
      <p>
        {kind === 'activated'
          ? `Your ${PLAN_MAP[targetTier].label} plan is now active.`
          : `Your plan will change to ${PLAN_MAP[targetTier].label} at the end of your current billing period. Effective date: ${dateLabel(effectiveAt)}. Your current access remains until the confirmed transition.`}
      </p>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
