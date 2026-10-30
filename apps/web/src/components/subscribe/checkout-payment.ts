'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { z } from 'zod';
import { planTierSchema, type PlanTier } from '@repo/contracts';

/**
 * The Razorpay payment this tab just made, so the checkout result page can print a
 * receipt for that payment and nothing else. Only purchase callbacks write it; card
 * updates, closed checkouts and status links don't, so those returns never print.
 * The id is a lookup key only: the receipt shows what the API recorded for it.
 */
const STORAGE_KEY = 'tickif:checkout-payment:v1';
const FRESH_FOR_MS = 60 * 60_000;

const checkoutPaymentSchema = z.object({
  targetTier: planTierSchema,
  paymentId: z.string().min(1),
  savedAt: z.number(),
});

export function rememberCheckoutPayment(targetTier: PlanTier, paymentId: string) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ targetTier, paymentId, savedAt: Date.now() }),
    );
  } catch {
    // Checkout still completes; the result page shows its plain confirmation.
  }
}

export function readCheckoutPayment(targetTier: PlanTier): string | null {
  return parse(readRaw(), targetTier);
}

/** The remembered payment id for this plan, or null. Null during server rendering. */
export function useCheckoutPayment(targetTier: PlanTier): string | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parse(raw, targetTier), [raw, targetTier]);
}

function parse(raw: string | null, targetTier: PlanTier): string | null {
  if (!raw) return null;
  try {
    const saved = checkoutPaymentSchema.safeParse(JSON.parse(raw));
    if (!saved.success || saved.data.targetTier !== targetTier) return null;
    return Date.now() - saved.data.savedAt <= FRESH_FOR_MS ? saved.data.paymentId : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// sessionStorage belongs to this tab; nothing else changes it while the page is open.
function subscribe() {
  return () => undefined;
}
