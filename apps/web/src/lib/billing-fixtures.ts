/**
 * Development-only billing state fixtures for E-179.
 * Used by the BillingDevSwitcher component to preview all billing scenarios.
 */

import type { BillingState, PlanTier, BillingLifecycleState } from './billing-types';
import { PLAN_TIER_PRICES } from './billing-types';

export type DevBillingScenario = {
  label: string;
  tier: PlanTier;
  lifecycle: BillingLifecycleState;
};

/**
 * Scenarios represent valid tier × lifecycle combinations.
 * Hobby has no Razorpay subscription, so only 'active' and 'downgraded' make sense.
 * Paid tiers can be in any lifecycle state.
 */
export const DEV_SCENARIOS: DevBillingScenario[] = [
  { label: 'Hobby (Active)', tier: 'hobby', lifecycle: 'active' },
  { label: 'Professional+ (Active)', tier: 'professional_plus', lifecycle: 'active' },
  { label: 'Professional+ (Payment Failed)', tier: 'professional_plus', lifecycle: 'payment_failed' },
  { label: 'Professional+ (Grace)', tier: 'professional_plus', lifecycle: 'grace' },
  { label: 'Professional+ (Locked)', tier: 'professional_plus', lifecycle: 'locked' },
  { label: 'Professional+ (Downgraded)', tier: 'professional_plus', lifecycle: 'downgraded' },
  { label: 'Corporate (Active)', tier: 'corporate', lifecycle: 'active' },
  { label: 'Corporate (Locked)', tier: 'corporate', lifecycle: 'locked' },
  { label: 'Corporate (Downgraded)', tier: 'corporate', lifecycle: 'downgraded' },
];

export function buildBillingState(tier: PlanTier, lifecycle: BillingLifecycleState): BillingState {
  const price = PLAN_TIER_PRICES[tier];
  const tax = price * 0.18;

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
    renewalDate: lifecycle === 'active' && tier !== 'hobby' ? '2026-12-12' : null,
    subscriptionId: tier === 'hobby' ? null : `sub_TICKIF_${tier.toUpperCase()}`,
    usage: {
      seats: seatsUsage[tier],
      branches: branchesUsage[tier],
    },
    billing:
      tier === 'hobby'
        ? null
        : {
            nextBillingDate: '2026-12-12',
            billingCycle: 'monthly',
            planAmount: price,
            tax,
            total: price + tax,
            paymentMethodLast4: '4242',
            paymentMethodBrand: 'Visa',
          },
    graceDaysRemaining: lifecycle === 'grace' ? 5 : null,
    lockedDaysRemaining: lifecycle === 'locked' ? 25 : null,
    lastPaymentFailedDate: lifecycle === 'payment_failed' ? '2026-12-05' : null,
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
