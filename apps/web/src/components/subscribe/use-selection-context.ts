'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  billingSelectionContextSchema,
  type BillingSelectionContext,
  type PlanTier,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { reasonLabel } from './billing-reason';

function pricingRestriction(context: BillingSelectionContext | null): string | undefined {
  if (!context) return undefined;
  if (context.pendingOperation)
    return 'Your billing change is being confirmed. You can choose another plan once it is complete.';
  if (context.unfinishedCheckout) {
    return context.unfinishedCheckout.status === 'created'
      ? 'Continue your existing checkout above before choosing another plan.'
      : 'Your payment is being confirmed. No further purchase is needed.';
  }
  if (context.recovery?.status === 'checkout_pending')
    return 'Your payment is being confirmed. No further purchase is needed.';
  if (context.recovery?.status === 'requested')
    return 'Your cancellation is being confirmed. Your saved plan will be available after your current subscription ends.';
  if (
    context.recovery?.status === 'waiting_for_expiry' &&
    !context.actions.some((action) => action.action === 'change_plan')
  ) {
    const date = context.recovery.eligibleAt;
    return date
      ? `You can purchase your saved plan after ${new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}, once your current subscription has ended.`
      : 'You can purchase your saved plan once your current subscription has ended. We are checking the end date.';
  }
  if (context.scheduledChange && !context.actions.some((action) => action.action === 'cancel'))
    return 'A plan change is scheduled. You can choose another plan once it takes effect.';
  if (
    context.actions.some((action) => action.reason === 'cancellation_scheduled') &&
    !context.actions.some((action) => action.action === 'change_plan')
  )
    return reasonLabel('cancellation_scheduled');
  return undefined;
}

export function useSelectionContext(organizationId?: string | null) {
  const [context, setContext] = useState<BillingSelectionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refreshContext = useCallback(async () => {
    const request = ++generation.current;
    try {
      const response = await api.api.billing['selection-context'].$get();
      if (!response.ok) throw new Error('Unable to verify available billing actions.');
      const parsed = billingSelectionContextSchema.safeParse(await response.json());
      if (!parsed.success || (organizationId && parsed.data.organizationId !== organizationId)) {
        throw new Error('Unable to verify available billing actions.');
      }
      if (request !== generation.current) return;
      setContext(parsed.data);
      setError(null);
    } catch {
      if (request !== generation.current) return;
      setContext(null);
      setError('We could not check your available plans. We will try again automatically.');
      throw new Error('Billing selection unavailable');
    }
  }, [organizationId]);
  useEffect(() => {
    return () => {
      generation.current += 1;
    };
  }, [refreshContext]);

  const restriction = pricingRestriction(context);
  const actions: Partial<
    Record<PlanTier, { disabled: boolean; hidden?: boolean; reason?: string; label?: string }>
  > = {};
  for (const tier of ['hobby', 'professional_plus', 'corporate'] as const) {
    const action = context?.actions.find((entry) => entry.targetTier === tier);
    const savedReview =
      context?.recovery?.status === 'eligible' && context.recovery.targetTier === tier;
    actions[tier] = {
      disabled:
        !!restriction || !action || action.action === 'blocked' || action.action === 'current',
      hidden: !!restriction || savedReview,
      reason: restriction
        ? tier === context?.currentTier
          ? undefined
          : restriction
        : savedReview
          ? 'Review your saved plan above to continue.'
          : action?.reason
            ? reasonLabel(action.reason)
            : context
              ? undefined
              : (error ?? 'Checking available billing actions…'),
    };
  }
  const savedTargetTier =
    context?.recovery && !['completed', 'dismissed', 'superseded'].includes(context.recovery.status)
      ? context.recovery.targetTier
      : null;
  return { context, actions, error, refreshContext, savedTargetTier };
}
