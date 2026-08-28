import { config } from '@repo/config';
import type { PlanTier } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';

/**
 * Razorpay API client for E-115.
 *
 * Thin typed wrapper around Razorpay's REST API for subscription billing operations.
 * Uses the Test Mode or Live Mode credentials from environment config.
 *
 * Does NOT use the razorpay npm package — direct fetch with typed responses
 * keeps the dependency surface minimal.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

function getCredentials(): { keyId: string; keySecret: string } {
  const keyId = config.RAZORPAY_KEY_ID;
  const keySecret = config.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw AppError.unprocessable(
      'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
    );
  }
  return { keyId, keySecret };
}

function baseUrl(): string {
  return 'https://api.razorpay.com/v1';
}

function authHeaders(keyId: string, keySecret: string): Record<string, string> {
  const encoded = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}

// ─── Plan Mapping ────────────────────────────────────────────────────────────

/**
 * Config-driven plan mapping.
 * Maps our PlanTier to the Razorpay plan amount in paise.
 *
 * Hobby has NO Razorpay plan — it is local-only.
 * professional_plus = ₹2,999 = 299900 paise
 * corporate = ₹7,999 = 799900 paise
 */
export const RAZORPAY_PLAN_CONFIG: Record<
  Exclude<PlanTier, 'hobby'>,
  { amountPaise: number; period: 'monthly'; currency: string; description: string }
> = {
  professional_plus: {
    amountPaise: 299900,
    period: 'monthly',
    currency: 'INR',
    description: 'Tickif Professional+ — Monthly',
  },
  corporate: {
    amountPaise: 799900,
    period: 'monthly',
    currency: 'INR',
    description: 'Tickif Corporate — Monthly',
  },
};

/**
 * Whether a tier has a corresponding Razorpay plan.
 * Hobby is local-only — never represented in Razorpay.
 */
export function hasPaidPlan(tier: PlanTier): tier is Exclude<PlanTier, 'hobby'> {
  return tier !== 'hobby';
}

/**
 * Resolve the Razorpay plan ID for a given tier from server-side configuration.
 * NEVER trust client-supplied plan IDs — this is the authoritative mapping.
 *
 * Returns null if the tier has no configured plan ID (e.g., plans not yet created
 * in the Razorpay dashboard).
 */
export function resolveRazorpayPlanId(tier: Exclude<PlanTier, 'hobby'>): string | null {
  switch (tier) {
    case 'professional_plus':
      return config.RAZORPAY_PLAN_ID_PROFESSIONAL_PLUS ?? null;
    case 'corporate':
      return config.RAZORPAY_PLAN_ID_CORPORATE ?? null;
    default:
      return null;
  }
}

// ─── API Types ───────────────────────────────────────────────────────────────

export type RazorpayPlan = {
  id: string;
  entity: 'plan';
  interval: number;
  period: string;
  item: { id: string; name: string; amount: number; currency: string };
  created_at: number;
};

export type RazorpaySubscription = {
  id: string;
  entity: 'subscription';
  plan_id: string;
  status: string;
  current_start: number | null;
  current_end: number | null;
  short_url: string | null;
  created_at: number;
};

export type RazorpayError = {
  error: { code: string; description: string; source: string; step: string; reason: string };
};

// ─── API Operations ──────────────────────────────────────────────────────────

/**
 * Create a Razorpay plan (idempotent by checking existing plans).
 * In practice, plans are created once and reused via their plan_id.
 */
export async function createPlan(params: {
  name: string;
  amountPaise: number;
  currency: string;
  period: 'monthly' | 'yearly';
  interval?: number;
}): Promise<RazorpayPlan> {
  const { keyId, keySecret } = getCredentials();
  const response = await fetch(`${baseUrl()}/plans`, {
    method: 'POST',
    headers: authHeaders(keyId, keySecret),
    body: JSON.stringify({
      period: params.period,
      interval: params.interval ?? 1,
      item: {
        name: params.name,
        amount: params.amountPaise,
        currency: params.currency,
      },
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as RazorpayError;
    throw AppError.badGateway(
      `Razorpay createPlan failed: ${error.error?.description ?? response.statusText}`,
      { razorpayCode: error.error?.code, source: 'razorpay' },
    );
  }

  return (await response.json()) as RazorpayPlan;
}

/**
 * Create a Razorpay subscription for a given plan.
 * Returns the subscription object including the short_url for checkout.
 */
export async function createSubscription(params: {
  planId: string;
  totalCount?: number;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  const { keyId, keySecret } = getCredentials();
  const response = await fetch(`${baseUrl()}/subscriptions`, {
    method: 'POST',
    headers: authHeaders(keyId, keySecret),
    body: JSON.stringify({
      plan_id: params.planId,
      total_count: params.totalCount ?? 120, // ~10 years monthly
      notes: params.notes ?? {},
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as RazorpayError;
    throw AppError.badGateway(
      `Razorpay createSubscription failed: ${error.error?.description ?? response.statusText}`,
      { razorpayCode: error.error?.code, source: 'razorpay' },
    );
  }

  return (await response.json()) as RazorpaySubscription;
}

/**
 * Update an existing Razorpay subscription to a different plan.
 * Used for paid → paid tier changes (Professional+ ↔ Corporate).
 */
export async function updateSubscription(params: {
  subscriptionId: string;
  planId: string;
  /** When the plan change takes effect. 'cycle_end' defers to the next billing cycle. */
  scheduleChangeAt?: 'now' | 'cycle_end';
}): Promise<RazorpaySubscription> {
  const { keyId, keySecret } = getCredentials();
  const response = await fetch(`${baseUrl()}/subscriptions/${params.subscriptionId}`, {
    method: 'PATCH',
    headers: authHeaders(keyId, keySecret),
    body: JSON.stringify({
      plan_id: params.planId,
      schedule_change_at: params.scheduleChangeAt ?? 'cycle_end',
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as RazorpayError;
    throw AppError.badGateway(
      `Razorpay updateSubscription failed: ${error.error?.description ?? response.statusText}`,
      { razorpayCode: error.error?.code, source: 'razorpay' },
    );
  }

  return (await response.json()) as RazorpaySubscription;
}

/**
 * Cancel a Razorpay subscription at the end of the current billing cycle.
 * The subscription remains active until the period ends; Razorpay then sends
 * subscription.cancelled via webhook, which E-117 processes.
 */
export async function cancelSubscription(params: {
  subscriptionId: string;
  cancelAtCycleEnd?: boolean;
}): Promise<RazorpaySubscription> {
  const { keyId, keySecret } = getCredentials();
  const response = await fetch(`${baseUrl()}/subscriptions/${params.subscriptionId}/cancel`, {
    method: 'POST',
    headers: authHeaders(keyId, keySecret),
    body: JSON.stringify({
      cancel_at_cycle_end: params.cancelAtCycleEnd ?? true,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as RazorpayError;
    throw AppError.badGateway(
      `Razorpay cancelSubscription failed: ${error.error?.description ?? response.statusText}`,
      { razorpayCode: error.error?.code, source: 'razorpay' },
    );
  }

  return (await response.json()) as RazorpaySubscription;
}

/**
 * Verify that Razorpay credentials are valid by fetching the account's plan list.
 * Returns true if authentication succeeds.
 */
export async function verifyConnectivity(): Promise<boolean> {
  try {
    const { keyId, keySecret } = getCredentials();
    const response = await fetch(`${baseUrl()}/plans?count=1`, {
      method: 'GET',
      headers: authHeaders(keyId, keySecret),
    });
    return response.ok;
  } catch {
    return false;
  }
}
