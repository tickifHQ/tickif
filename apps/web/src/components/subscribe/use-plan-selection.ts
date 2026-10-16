'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlanTier } from '@repo/contracts';

export interface BillingSelectionScope {
  userId?: string;
  organizationId?: string | null;
}

/** Browsing intent only: payment data and accepted recovery live on the server. */
export function usePlanSelection({
  userId,
  organizationId,
  initialTier = null,
}: BillingSelectionScope & { currentTier: PlanTier | null; initialTier?: PlanTier | null }) {
  const storageKey =
    userId && organizationId ? `tickif:billing-selection:v1:${userId}:${organizationId}` : null;
  const [selection, setTarget] = useState<{ key: string | null; tier: PlanTier | null }>({
    key: storageKey,
    tier: initialTier,
  });
  const selectedTier = selection.key === storageKey ? selection.tier : null;

  useEffect(() => {
    setTarget((value) => (value.key === storageKey ? value : { key: storageKey, tier: null }));
    if (!storageKey) return;
    try {
      // Discard browsing intent saved by older versions; no plan is reserved locally.
      sessionStorage.removeItem(storageKey);
    } catch {
      // Browsing intent only lives in memory when storage is unavailable, too.
    }
  }, [storageKey]);

  const setSelectedTier = useCallback(
    (tier: PlanTier | null) => {
      setTarget({ key: storageKey, tier });
    },
    [storageKey],
  );

  return { selectedTier, setSelectedTier };
}
