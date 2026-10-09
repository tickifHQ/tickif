import type { SubscriptionResponse } from '@repo/contracts';
import type { BillingState } from './billing-types';
import { PLAN_TIER_PRICES } from './billing-types';

/** Hobby defaults for fixtures; API failure must never imply a free plan. */
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
export function mapSubscriptionToBillingState(
  sub: SubscriptionResponse,
  observedAt = Date.now(),
): BillingState {
  const price = PLAN_TIER_PRICES[sub.tier];
  // An active provider status can outlive its last known cycle. Keep access
  // intact, but do not present a past or malformed date as the next renewal.
  const periodEnd = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : NaN;
  const displayPeriodEnd =
    sub.lifecycleState === 'active' && !(Number.isFinite(periodEnd) && periodEnd > observedAt)
      ? null
      : sub.currentPeriodEnd;

  return {
    ...(sub.earlyBirdTrial ? { earlyBirdTrial: sub.earlyBirdTrial } : {}),
    lifecycle: sub.lifecycleState,
    tier: sub.tier,
    razorpayStatus: sub.razorpayStatus,
    cancellationScheduled: sub.cancellationScheduled,
    preLapseTier: sub.preLapseTier,
    renewalDate: displayPeriodEnd,
    subscriptionId: sub.razorpaySubscriptionId ?? null,
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
      sub.tier !== 'hobby' && !sub.earlyBirdTrial
        ? {
            nextBillingDate: displayPeriodEnd,
            billingCycle: 'monthly',
            planAmount: price,
            tax: 0,
            total: price,
            paymentMethodLast4: null,
            paymentMethodBrand: null,
          }
        : null,
    graceDaysRemaining: sub.graceDaysRemaining,
    lockedDaysRemaining: sub.lockedDaysRemaining,
    lastPaymentFailedDate: null,
    frozenResources: sub.frozenResources.map((resource) => ({
      label: resource.label,
      quantity: resource.count,
      recoverable: true,
    })),
    lockedAccess:
      sub.lifecycleState === 'locked'
        ? {
            suspended: [
              'Team management',
              'Branch dashboards',
              'Discovery priority',
              'Verified badge',
            ],
            available: ['Public portfolio', 'Published projects', 'Existing enquiries'],
          }
        : null,
  };
}
