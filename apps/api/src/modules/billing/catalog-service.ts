import {
  EARLY_BIRD_DEADLINE,
  EARLY_BIRD_MONTHS,
  PLAN_TIER_VALUES,
  resolveEntitlements,
  type BillingCatalogResponse,
  type PlanTier,
} from '@repo/contracts';
import { RAZORPAY_PLAN_CONFIG } from './razorpay-client.js';

const descriptions: Record<PlanTier, { name: string; description: string }> = {
  hobby: { name: 'Hobby', description: 'For independent designers' },
  professional_plus: { name: 'Professional+', description: 'For studios growing their presence' },
  corporate: { name: 'Corporate', description: 'For firms with teams' },
};

/** Uses the same price configuration and entitlement rules as subscription billing. */
export const catalogService = {
  getPlans(now = new Date()): BillingCatalogResponse {
    return {
      earlyBird:
        now < new Date(EARLY_BIRD_DEADLINE)
          ? { months: EARLY_BIRD_MONTHS, claimBefore: EARLY_BIRD_DEADLINE, cardRequired: false }
          : null,
      plans: PLAN_TIER_VALUES.map((tier) => {
        const entitlements = resolveEntitlements(tier, 'active', true);
        return {
          tier,
          ...descriptions[tier],
          amountPaise: tier === 'hobby' ? 0 : RAZORPAY_PLAN_CONFIG[tier].amountPaise,
          currency: 'INR',
          interval: 'monthly',
          features: [
            entitlements.seatLimit === -1 ? 'Unlimited seats' : `${entitlements.seatLimit} seat`,
            entitlements.branchLimit === -1
              ? 'Unlimited branches'
              : `${entitlements.branchLimit} branch`,
            entitlements.analyticsScope === 'branch' ? 'Branch analytics' : 'Basic analytics',
            entitlements.directoryTopPlacement
              ? 'Prime directory placement'
              : 'Standard directory listing',
            ...(entitlements.rankingTier > 0 ? ['Discovery priority'] : []),
            ...(entitlements.canDisplayVerifiedBadge
              ? ['Verified badge, subject to approval']
              : []),
            ...(entitlements.rbacEnabled ? ['Full role-based access'] : []),
            'Enquiries and client contact',
          ],
        };
      }),
    };
  },
};
