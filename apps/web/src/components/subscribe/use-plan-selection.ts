'use client';

import { useCallback, useEffect, useState } from 'react';
import { planTierSchema, type PlanTier } from '@repo/contracts';

export interface BillingSelectionScope {
  userId?: string;
  organizationId?: string | null;
}

/** Browsing intent only: payment data and accepted recovery live on the server. */
export function usePlanSelection({
  userId,
  organizationId,
  currentTier,
}: BillingSelectionScope & { currentTier: PlanTier | null }) {
  const storageKey =
    userId && organizationId ? `tickif:billing-selection:v1:${userId}:${organizationId}` : null;
  const [selection, setTarget] = useState<{ key: string | null; tier: PlanTier | null }>({
    key: storageKey,
    tier: null,
  });
  const selectedTier = selection.key === storageKey ? selection.tier : null;

  useEffect(() => {
    if (!storageKey) {
      setTarget({ key: storageKey, tier: null });
      return;
    }
    try {
      const parsed = planTierSchema.safeParse(sessionStorage.getItem(storageKey));
      setTarget({
        key: storageKey,
        tier: parsed.success && parsed.data !== currentTier ? parsed.data : null,
      });
      if (!parsed.success || parsed.data === currentTier) sessionStorage.removeItem(storageKey);
    } catch {
      setTarget({ key: storageKey, tier: null });
      // Storage may be unavailable in private browsing; selection still works in memory.
    }
  }, [storageKey, currentTier]);

  const setSelectedTier = useCallback(
    (tier: PlanTier | null) => {
      setTarget({ key: storageKey, tier });
      if (!storageKey) return;
      try {
        if (tier) sessionStorage.setItem(storageKey, tier);
        else sessionStorage.removeItem(storageKey);
      } catch {
        // Browser persistence is best effort and never authorizes a billing action.
      }
    },
    [storageKey],
  );

  return { selectedTier, setSelectedTier };
}
