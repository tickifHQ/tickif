'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  billingSelectionContextSchema,
  type BillingSelectionContext,
  type PlanTier,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { reasonLabel } from './billing-reason';

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

  const actions: Partial<Record<PlanTier, { disabled: boolean; reason?: string; label?: string }>> =
    {};
  for (const tier of ['hobby', 'professional_plus', 'corporate'] as const) {
    const action = context?.actions.find((entry) => entry.targetTier === tier);
    actions[tier] = {
      disabled: !action || action.action === 'blocked' || action.action === 'current',
      reason: action?.reason
        ? reasonLabel(action.reason)
        : context
          ? undefined
          : (error ?? 'Checking available billing actions…'),
    };
  }
  return { context, actions, error, refreshContext };
}
