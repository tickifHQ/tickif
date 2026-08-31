import type { SubscriptionResponse } from '@repo/contracts';
import type { BillingState } from './billing-types';
import { PLAN_TIER_PRICES } from './billing-types';

/** Hobby defaults when no subscription exists or the API is unavailable. */
export const HOBBY_DEFAULT: BillingState = {
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

/** Keep server rendering and client reconciliation on the same complete view model. */
export function mapSubscriptionToBillingState(sub: SubscriptionResponse): BillingState {
  const price = PLAN_TIER_PRICES[sub.tier];

  return {
    lifecycle: sub.lifecycleState,
    tier: sub.tier,
    razorpayStatus: sub.razorpayStatus,
    cancellationScheduled: sub.cancellationScheduled,
    preLapseTier: null,
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
    billing:
      sub.tier !== 'hobby'
        ? {
            nextBillingDate: sub.currentPeriodEnd,
            billingCycle: 'monthly',
            planAmount: price,
            tax: 0,
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
