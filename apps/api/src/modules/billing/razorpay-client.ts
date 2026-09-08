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
  notes?: Record<string, string>;
  /** True when Razorpay will cancel the subscription after the current cycle. */
  cancel_at_cycle_end?: boolean;
  /** Unix timestamp when cancellation was scheduled (cancel_at_cycle_end). Null if not cancelled. */
  cancelled_at?: number | null;
  /** Unix timestamp when subscription ended. Null if still active/scheduled. */
  ended_at?: number | null;
  created_at: number;
};

export type RazorpayError = {
  error: { code: string; description: string; source: string; step: string; reason: string };
};

type RazorpayOperation =
  | 'createPlan'
  | 'createSubscription'
  | 'updateSubscription'
  | 'cancelSubscription'
  | 'fetchSubscription';

/**
 * Optional per-operation classifier for provider error responses.
 *
 * Called ONLY on a non-2xx Razorpay response, BEFORE the default 502 mapping.
 * Return an `AppError` to override the mapping for a specific, recognized
 * business error; return `undefined` to fall through to the default
 * `badGateway` (502) behaviour. This keeps the default mapping — and every
 * operation that does not pass a classifier — completely unchanged.
 */
type RazorpayErrorClassifier = (
  providerError: Partial<RazorpayError>,
  status: number,
) => AppError | undefined;

async function requestRazorpay<T>(
  operation: RazorpayOperation,
  path: string,
  init: RequestInit,
  classifyError?: RazorpayErrorClassifier,
): Promise<T> {
  const { keyId, keySecret } = getCredentials();
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: authHeaders(keyId, keySecret),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'NetworkError';
    throw AppError.badGateway(`Razorpay ${operation} failed: provider unavailable`, {
      source: 'razorpay',
      reason,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw AppError.badGateway(`Razorpay ${operation} failed: invalid provider response`, {
      source: 'razorpay',
      status: response.status,
    });
  }

  if (!response.ok) {
    const providerError = payload as Partial<RazorpayError>;
    // Give the caller a narrow chance to reclassify a recognized business error
    // (e.g. E-289 domestic-card plan change). Anything not explicitly recognized
    // still maps to badGateway (502) exactly as before.
    const classified = classifyError?.(providerError, response.status);
    if (classified) {
      throw classified;
    }
    throw AppError.badGateway(
      `Razorpay ${operation} failed: ${providerError.error?.description ?? response.statusText}`,
      { razorpayCode: providerError.error?.code, source: 'razorpay' },
    );
  }

  return payload as T;
}

/**
 * E-289: detect Razorpay's refusal to change the plan of a subscription whose
 * mandate was authorized with a domestic card.
 *
 * Verified signal (from QA evidence / repo error fixtures):
 *   HTTP 400, error.code = 'BAD_REQUEST_ERROR',
 *   error.description contains
 *   "Only offers can be updated for subscriptions when payment mode is domestic card."
 *
 * `BAD_REQUEST_ERROR` is Razorpay's generic 400 code and is NOT unique to this
 * case, so the description substring is the discriminating signal. Matching is
 * kept deliberately narrow (status 400 + description substring) so unrelated
 * 400s continue to map to 502. The substring is normalized to lowercase to
 * tolerate casing differences. See docs note in billing contracts.
 */
export function isDomesticCardPlanChangeRejection(
  providerError: Partial<RazorpayError>,
  status: number,
): boolean {
  if (status !== 400) return false;
  const description = providerError.error?.description?.toLowerCase() ?? '';
  return (
    description.includes('payment mode is domestic card') &&
    description.includes('only offers can be updated')
  );
}

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
  return requestRazorpay<RazorpayPlan>('createPlan', '/plans', {
    method: 'POST',
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
  return requestRazorpay<RazorpaySubscription>('createSubscription', '/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: params.planId,
      total_count: params.totalCount ?? 120, // ~10 years monthly
      notes: params.notes ?? {},
    }),
  });
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
  return requestRazorpay<RazorpaySubscription>(
    'updateSubscription',
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        plan_id: params.planId,
        schedule_change_at: params.scheduleChangeAt ?? 'cycle_end',
      }),
    },
    // E-289: reclassify ONLY the domestic-card plan-change rejection to an
    // actionable 422. This classifier is scoped to updateSubscription; every
    // other operation keeps the default 502 mapping unchanged.
    (providerError, status) =>
      isDomesticCardPlanChangeRejection(providerError, status)
        ? AppError.paymentModeChangeUnsupported(
            'This subscription was set up with a payment method that does not support ' +
              'changing plans directly. Cancel the current plan and subscribe to the new ' +
              'plan instead.',
            { source: 'razorpay', razorpayCode: providerError.error?.code },
          )
        : undefined,
  );
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
  return requestRazorpay<RazorpaySubscription>(
    'cancelSubscription',
    `/subscriptions/${encodeURIComponent(params.subscriptionId)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        cancel_at_cycle_end: params.cancelAtCycleEnd ?? true,
      }),
    },
  );
}

/**
 * Fetch a subscription's live state from Razorpay.
 * Used for reconciliation when webhooks may have been missed.
 */
export async function fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
  return requestRazorpay<RazorpaySubscription>(
    'fetchSubscription',
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: 'GET' },
  );
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
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
