/**
 * Development-only billing state fixtures for E-179.
 * Used by the BillingDevSwitcher component to preview all billing scenarios.
 */

import type { BillingState, PlanTier, BillingLifecycleState } from './billing-types';
import { isoDateOffsetDays, PLAN_TIER_PRICES } from './billing-types';

export type DevBillingScenario = {
  label: string;
  tier: PlanTier;
  lifecycle: BillingLifecycleState;
  preLapseTier?: PlanTier;
};

/**
 * Legal combinations match the E-114 CHECK:
 * - Hobby has no Razorpay plan, so only `active` (and terminal `downgraded`).
 * - `downgraded` is always Hobby; `preLapseTier` holds the paid tier.
 * - Paid tiers may be active / payment_failed / grace / locked.
 */
export function isValidBillingCombination(
  tier: PlanTier,
  lifecycle: BillingLifecycleState,
  preLapseTier: PlanTier | null = null,
): boolean {
  if (lifecycle === 'downgraded') {
    return tier === 'hobby' && preLapseTier != null && preLapseTier !== 'hobby';
  }
  if (lifecycle === 'active') {
    return true;
  }
  return tier !== 'hobby';
}

export const DEV_SCENARIOS: DevBillingScenario[] = [
  { label: 'Hobby (Active)', tier: 'hobby', lifecycle: 'active' },
  { label: 'Professional+ (Active)', tier: 'professional_plus', lifecycle: 'active' },
  { label: 'Professional+ (Payment Failed)', tier: 'professional_plus', lifecycle: 'payment_failed' },
  { label: 'Professional+ (Grace)', tier: 'professional_plus', lifecycle: 'grace' },
  { label: 'Professional+ (Locked)', tier: 'professional_plus', lifecycle: 'locked' },
  {
    label: 'Hobby (Downgraded from Professional+)',
    tier: 'hobby',
    lifecycle: 'downgraded',
    preLapseTier: 'professional_plus',
  },
  { label: 'Corporate (Active)', tier: 'corporate', lifecycle: 'active' },
  { label: 'Corporate (Locked)', tier: 'corporate', lifecycle: 'locked' },
  {
    label: 'Hobby (Downgraded from Corporate)',
    tier: 'hobby',
    lifecycle: 'downgraded',
    preLapseTier: 'corporate',
  },
];

export function buildBillingState(
  tier: PlanTier,
  lifecycle: BillingLifecycleState,
  preLapseTier: PlanTier | null = null,
): BillingState {
  if (!isValidBillingCombination(tier, lifecycle, preLapseTier)) {
    throw new Error(`Invalid billing combination: ${tier} × ${lifecycle}`);
  }

  const price = PLAN_TIER_PRICES[tier];
  const tax = price * 0.18;
  const resolvedPreLapse =
    lifecycle === 'downgraded' ? (preLapseTier ?? 'professional_plus') : null;

  const seatsUsage: Record<PlanTier, BillingState['usage']['seats']> = {
    hobby: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
    professional_plus: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
    corporate: { label: 'Team Seats', current: 5, limit: null, unit: 'seats' },
  };

  const branchesUsage: Record<PlanTier, BillingState['usage']['branches']> = {
    hobby: { label: 'Branches', current: 1, limit: 1, unit: 'branches' },
    professional_plus: { label: 'Branches', current: 1, limit: 1, unit: 'branches' },
    corporate: { label: 'Branches', current: 4, limit: null, unit: 'branches' },
  };

  return {
    lifecycle,
    tier,
    razorpayStatus: tier !== 'hobby' ? 'active' : null,
    cancellationScheduled: false,
    preLapseTier: resolvedPreLapse,
    renewalDate: lifecycle === 'active' && tier !== 'hobby' ? isoDateOffsetDays(30) : null,
    subscriptionId: tier === 'hobby' && lifecycle !== 'downgraded' ? null : `sub_TICKIF_${tier.toUpperCase()}`,
    usage: {
      seats: seatsUsage[tier],
      branches: branchesUsage[tier],
    },
    billing:
      tier === 'hobby'
        ? null
        : {
            nextBillingDate: isoDateOffsetDays(30),
            billingCycle: 'monthly',
            planAmount: price,
            tax,
            total: price + tax,
            paymentMethodLast4: '4242',
            paymentMethodBrand: 'Visa',
          },
    graceDaysRemaining: lifecycle === 'grace' ? 5 : null,
    lockedDaysRemaining: lifecycle === 'locked' ? 25 : null,
    lastPaymentFailedDate:
      lifecycle === 'payment_failed' || lifecycle === 'grace' ? isoDateOffsetDays(-2) : null,
    frozenResources:
      lifecycle === 'downgraded'
        ? [
            { label: 'Additional Seats', quantity: 4, recoverable: true },
            { label: 'Branches', quantity: 3, recoverable: true },
          ]
        : [],
    lockedAccess:
      lifecycle === 'locked'
        ? {
            suspended: [
              'New project creation',
              'Lead responses',
              'Portfolio editing',
              'Team invites',
            ],
            available: [
              'View existing projects',
              'View existing leads',
              'Public portfolio (read-only)',
            ],
          }
        : null,
  };
}
