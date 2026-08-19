/**
 * Development-only billing state fixtures for E-179.
 * NOT imported in production builds.
 */

import type { BillingState, PlanTier, BillingLifecycleState, OrgRole } from './billing-types';
import { PLAN_TIER_PRICES } from './billing-types';

export type { OrgRole } from './billing-types';

export type DevBillingScenario = {
  label: string;
  tier: PlanTier;
  role: OrgRole;
  lifecycle: BillingLifecycleState;
};

export const DEV_SCENARIOS: DevBillingScenario[] = [
  { label: 'Hobby (Owner)', tier: 'hobby', role: 'owner', lifecycle: 'active' },
  { label: 'Professional+ (Owner)', tier: 'professional_plus', role: 'owner', lifecycle: 'active' },
  { label: 'Corporate (Owner)', tier: 'corporate', role: 'owner', lifecycle: 'active' },
  { label: 'Corporate (Billing Admin)', tier: 'corporate', role: 'billing_admin', lifecycle: 'active' },
  { label: 'Corporate (Admin — no access)', tier: 'corporate', role: 'admin', lifecycle: 'active' },
  { label: 'Corporate (Member — no access)', tier: 'corporate', role: 'member', lifecycle: 'active' },
  { label: 'Corporate (Viewer — no access)', tier: 'corporate', role: 'viewer', lifecycle: 'active' },
];

export const DEV_LIFECYCLES: { label: string; value: BillingLifecycleState }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Payment Failed', value: 'payment_failed' },
  { label: 'Grace (7 days)', value: 'grace' },
  { label: 'Locked', value: 'locked' },
  { label: 'Downgraded', value: 'downgraded' },
];

export function hasBillingAccess(role: OrgRole): boolean {
  return role === 'owner' || role === 'billing_admin';
}

export function buildBillingState(tier: PlanTier, lifecycle: BillingLifecycleState): BillingState {
  const price = PLAN_TIER_PRICES[tier];
  const tax = price * 0.18;

  const seatsUsage: Record<PlanTier, BillingState['usage']['seats']> = {
    hobby: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
    professional_plus: { label: 'Team Seats', current: 1, limit: 1, unit: 'seats' },
    corporate: { label: 'Team Seats', current: 5, limit: 20, unit: 'seats' },
  };

  const base: BillingState = {
    lifecycle,
    tier,
    renewalDate: lifecycle === 'active' && tier !== 'hobby' ? '2026-12-12' : null,
    subscriptionId: tier === 'hobby' ? null : `sub_TICKIF_${tier.toUpperCase()}`,
    usage: {
      seats: seatsUsage[tier],
      ...(tier === 'corporate'
        ? { branches: { label: 'Branches', current: 4, limit: null, unit: 'branches' } }
        : {}),
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
            suspended: ['New project creation', 'Lead responses', 'Portfolio editing', 'Team invites'],
            available: ['View existing projects', 'View existing leads', 'Public portfolio (read-only)'],
          }
        : null,
  };

  return base;
}
