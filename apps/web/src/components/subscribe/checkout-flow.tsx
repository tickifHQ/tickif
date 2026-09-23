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
} from '@repo/contracts';
import { isUpgrade, isValidTier, PLAN_MAP } from '@/lib/plan-config';
import { PlanSelection } from './plan-selection';
import { api } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { waitForSubscriptionActivation } from '@/lib/subscription-activation';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { reasonLabel } from './billing-reason';

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
  onSubscriptionChange?: () => void;
}

type Step =
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

  const review = useCallback(async (tier: PlanTier) => {
    const request = ++sequence.current;
    setTarget(tier);
    setStep('loading');
    setPreview(null);
    setMessage('');
    operationId.current = null;
    try {
      const response = await api.api.billing['change-preview'].$post({
        json: { targetTier: tier },
      });
      if (!mounted.current || request !== sequence.current) return;
      if (!response.ok)
        throw new Error('Unable to verify this plan change. Refresh billing and retry.');
      const parsed = billingChangePreviewSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.targetTier !== tier)
        throw new Error('Unable to verify the selected plan.');
      if (!mounted.current || request !== sequence.current) return;
      setPreview(parsed.data);
      if (parsed.data.action === 'recover') {
        const recoveryResponse = await api.api.billing.recovery.$get();
        if (!recoveryResponse.ok)
          throw new Error('Unable to load your saved plan. Please try again.');
        const saved = billingRecoveryResponseSchema.safeParse(await recoveryResponse.json());
        if (!saved.success) throw new Error('Unable to check your saved plan. Please try again.');
        if (!mounted.current || request !== sequence.current) return;
        setRecovery(saved.data.recovery);
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
        : 'Unable to complete the request. Refresh billing before retrying.',
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
      if (preview.action === 'recover') {
        const response = await api.api.billing.recovery.$post({
          json: { ...json, expectedRevision: recovery?.revision ?? null },
        });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        const data = billingRecoveryResponseSchema.safeParse(await response.json());
        if (!data.success)
          throw new Error('Recovery status could not be confirmed. Refresh billing.');
        if (!mounted.current) return;
        setRecovery(data.data.recovery);
        setStep('recovery');
        onSubscriptionChange?.();
      } else if (preview.action === 'subscribe') {
        const response = await api.api.billing.subscribe.$post({ json });
        acknowledged = true;
        if (!response.ok) await failResponse(response);
        const parsedCheckout = billingSubscribeOutcomeSchema.safeParse(await response.json());
        if (!mounted.current) return;
        if (!parsedCheckout.success || parsedCheckout.data.targetTier !== target) {
          setMessage(
            'Checkout details could not be verified. Refresh billing status before retrying.',
          );
          setStep('pending');
          return;
        }
        const data = parsedCheckout.data;
        if (data.outcome === 'reconciliation_pending' || data.outcome === 'failed') {
          setMessage(
            'We are checking your checkout. Refresh billing before trying again.',
          );
          setStep('pending');
          return;
        }
        onSubscriptionChange?.();
        externalCheckout.current = true;
        onOpenChange(false);
        await openRazorpayCheckout({
          keyId: data.razorpayKeyId,
          subscriptionId: data.razorpaySubscriptionId,
          targetTier: target,
          prefill: data.prefill,
          onDismiss: () => {
            if (!mounted.current) return;
            externalCheckout.current = false;
            setMessage(`Checkout closed. ${PLAN_MAP[target].label} is still selected.`);
            setStep('error');
            onOpenChange(true);
          },
          onSuccess: async (payment) => {
            if (!mounted.current) return;
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
                  'Payment verification is pending. Refresh billing before another attempt.',
                );
              if (!mounted.current) return;
              const activated = await waitForSubscriptionActivation(target, {
                isCurrent: () => mounted.current,
              });
              if (!mounted.current) return;
              setStep(activated ? 'activated' : 'pending');
              onSubscriptionChange?.();
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
          setMessage(
            'We could not confirm this change. Refresh billing before trying again.',
          );
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
          setMessage('The plan change failed. Refresh billing to verify your current access.');
        onSubscriptionChange?.();
      }
    } catch (error) {
      if (mounted.current) {
        externalCheckout.current = false;
        onOpenChange(true);
        setMessage(error instanceof Error ? error.message : 'Unable to complete billing request.');
        setStep(acknowledged ? 'error' : 'pending');
      }
    } finally {
      inFlight.current = false;
    }
  }
  const label = target ? PLAN_MAP[target].label : '';
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
      onOpenChange={(value) => {
        if (!blocking) onOpenChange(value);
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
                {step === 'loading'
                  ? 'Checking your plan…'
                  : 'Updating your billing…'}
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
                    {preview.timing === 'now'
                      ? 'Once confirmed'
                      : dateLabel(preview.effectiveAt)}
                  </dd>
                  <dt>Next renewal</dt>
                  <dd>{dateLabel(preview.nextRenewalAt)}</dd>
                  <dt>Monthly price</dt>
                  <dd>{money(preview.recurringAmount, preview.currency)}</dd>
                  <dt>
                    {preview.adjustmentDirection === 'refund'
                      ? 'Refund'
                      : 'Additional charge'}
                  </dt>
                  <dd>
                    {money(preview.adjustmentAmount, preview.currency)}
                    {preview.amountCertainty === 'estimated' ? ' (estimate)' : ''}
                  </dd>
                </dl>
                {preview.action === 'subscribe' && (
                  <p className="text-sm text-muted-foreground">
                    Review the final recurring amount and payment authorization in Razorpay
                    Checkout. Monthly display pricing is not today’s charge.
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
                    access continues until your subscription ends. No replacement
                    subscription is purchased now.
                  </p>
                )}
                {recovery && preview.action === 'recover' && (
                  <p className="text-sm">
                    Previously selected: {PLAN_MAP[recovery.targetTier].label}. This will be replaced
                    with {label}.
                  </p>
                )}
                {preview.confirmationAllowed && (
                  <Button onClick={() => void confirm()}>
                    {preview.action === 'subscribe'
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
                    setStep('select');
                  }}
                >
                  Choose another plan
                </Button>
              </div>
            )}
            {step === 'recovery' && (
              <div className="flex flex-col gap-4" role="status">
                <h2 className="text-lg font-semibold">Plan saved</h2>
                <p>
                  {label} selected.{' '}
                  {recovery?.status === 'waiting_for_expiry'
                    ? `Cancellation is scheduled; current access remains until ${dateLabel(recovery.eligibleAt)}. Continue to ${label} checkout after the current subscription ends.`
                    : recovery?.status === 'eligible'
                      ? 'The previous subscription has ended. Review your selected plan to continue checkout.'
                      : 'Cancellation is still being confirmed. Refresh billing before continuing.'}
                </p>
                <p>
                  No replacement purchase will start automatically. Unused value does not
                  automatically transfer to a new subscription.
                </p>
                <Button
                  onClick={() => {
                    onSubscriptionChange?.();
                    onOpenChange(false);
                  }}
                >
                  Refresh billing status
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            )}
            {step === 'error' && (
              <div className="flex flex-col gap-4">
                <p role="alert">{message}</p>
                {target && <Button onClick={() => void review(target)}>Retry {label}</Button>}
                <Button variant="outline" onClick={() => setStep('select')}>
                  Choose another plan
                </Button>
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
                <Button
                  onClick={() => {
                    onSubscriptionChange?.();
                    onOpenChange(false);
                  }}
                >
                  Refresh billing status
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
