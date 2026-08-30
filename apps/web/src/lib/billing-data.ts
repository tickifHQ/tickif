/**
 * Billing data adapter for E-179.
 *
 * Fetches real subscription state from GET /api/billing/subscription (E-119)
 * and maps it to the BillingState type used by the Plan & Billing UI.
 */

import { api } from '@/lib/api';
import type { BillingState } from './billing-types';
import { PLAN_TIER_PRICES } from './billing-types';
import type { SubscriptionResponse } from '@repo/contracts';

/** Hobby defaults when no subscription exists or the API is unavailable. */
const HOBBY_DEFAULT: BillingState = {
  lifecycle: 'active',
  tier: 'hobby',
  razorpayStatus: null,
  cancellationScheduled: false,
  preLapseTier: null,
  renewalDate: null,
  subscriptionId: null,
  usage: {
    seats: { label: 'Team Seats', current: 0, limit: 1, unit: 'seats' },
    branches: { label: 'Branches', current: 0, limit: 1, unit: 'branches' },
  },
  billing: null,
  graceDaysRemaining: null,
  lockedDaysRemaining: null,
  lastPaymentFailedDate: null,
  frozenResources: [],
  lockedAccess: null,
};

/**
 * Fetch billing state for the active organization.
 * Calls GET /api/billing/subscription (E-119) and maps to BillingState.
 */
export async function getBillingState(): Promise<BillingState> {
  try {
    // Trigger Razorpay reconciliation on page load — self-heals if webhooks were missed.
    // The refresh endpoint is idempotent and skips if states already match.
    try {
      await api.api.billing.subscription.refresh.$get(undefined, {
        init: { cache: 'no-store' },
      });
    } catch {
      // Reconciliation failure is non-fatal — continue with local state
    }

    const response = await api.api.billing.subscription.$get(undefined, {
      init: { cache: 'no-store' },
    });

    if (!response.ok) {
      return HOBBY_DEFAULT;
    }

    const data = (await response.json()) as SubscriptionResponse;
    return mapSubscriptionToBillingState(data);
  } catch {
    // API unavailable — return hobby defaults
    return HOBBY_DEFAULT;
  }
}

function mapSubscriptionToBillingState(sub: SubscriptionResponse): BillingState {
  const price = PLAN_TIER_PRICES[sub.tier];

  return {
    lifecycle: sub.lifecycleState,
    tier: sub.tier,
    razorpayStatus: sub.razorpayStatus,
    cancellationScheduled: sub.cancellationScheduled ?? false,
    preLapseTier: null, // E-119 doesn't expose preLapseTier yet
    renewalDate: sub.currentPeriodEnd,
    subscriptionId: sub.razorpayStatus ? `sub_${sub.tier}` : null,
    usage: {
      seats: {
        label: 'Team Seats',
        current: sub.seatUsage,
        limit: sub.entitlements.seatLimit === -1 ? null : sub.entitlements.seatLimit,
        unit: 'seats',
      },
      branches: {
        label: 'Branches',
        current: sub.branchUsage,
        limit: sub.entitlements.branchLimit === -1 ? null : sub.entitlements.branchLimit,
        unit: 'branches',
      },
    },
    billing: sub.tier !== 'hobby'
      ? {
          nextBillingDate: sub.currentPeriodEnd,
          billingCycle: 'monthly',
          planAmount: price,
          tax: 0, // Razorpay charges plan price directly
          total: price,
          paymentMethodLast4: null,
          paymentMethodBrand: null,
        }
      : null,
    graceDaysRemaining: null,
    lockedDaysRemaining: null,
    lastPaymentFailedDate: null,
    frozenResources: [],
    lockedAccess: null,
  };
}
