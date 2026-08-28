import type { PlanTier } from '@repo/contracts';
export type { PlanTier };

/**
 * E-120 plan configuration — frontend display definitions.
 *
 * Prices are in whole INR (rupees) for display. The backend stores paise.
 * Entitlement values come from E-119 (GET /api/billing/subscription).
 * This file is DISPLAY ONLY — never used for authorization decisions.
 *
 * RULES:
 * - No "Free" naming for Hobby (display ₹0/month)
 * - No early-bird messaging
 * - Enquiry/lead visibility is NOT a paid feature
 * - Professional+ does NOT show an add-seat affordance
 */

export type PlanDefinition = {
  tier: PlanTier;
  label: string;
  /** Explicit tier rank. Higher = more features. */
  rank: number;
  price: number; // monthly INR (display only)
  /**
   * Base features unique to this tier (not inherited from lower tiers).
   * The full feature set = own baseFeatures + all lower-ranked tiers' baseFeatures.
   */
  baseFeatures: string[];
};

export const PLANS: PlanDefinition[] = [
  {
    tier: 'hobby',
    label: 'Hobby',
    rank: 0,
    price: 0,
    baseFeatures: ['1 Seat', '1 Branch', 'Basic Analytics', 'Standard Directory Listing'],
  },
  {
    tier: 'professional_plus',
    label: 'Professional+',
    rank: 1,
    price: 2999,
    baseFeatures: ['Verified Badge', 'Discovery Priority', 'Priority Support'],
  },
  {
    tier: 'corporate',
    label: 'Corporate',
    rank: 2,
    price: 7999,
    baseFeatures: [
      'Unlimited Seats',
      'Unlimited Branches',
      'Branch Analytics',
      'Full RBAC',
      'Prime Directory Placement',
      'Dedicated Support',
    ],
  },
];

/** Lookup by tier key. Never relies on array position. */
export const PLAN_MAP: Record<PlanTier, PlanDefinition> = Object.fromEntries(
  PLANS.map((p) => [p.tier, p]),
) as Record<PlanTier, PlanDefinition>;

/** Estimated tax rate — kept for backward compatibility but no longer shown in the review step. */
export const ESTIMATED_TAX_RATE = 0.18;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get the cumulative feature set for a tier.
 * Includes its own baseFeatures plus all lower-ranked tiers' baseFeatures.
 */
export function getCumulativeFeatures(tier: PlanTier): string[] {
  const plan = PLAN_MAP[tier];
  const lowerTiers = PLANS.filter((p) => p.rank < plan.rank);
  const inherited = lowerTiers.flatMap((p) => p.baseFeatures);
  return [...inherited, ...plan.baseFeatures];
}

/** Whether target is a higher tier than current. Uses explicit rank. */
export function isUpgrade(current: PlanTier, target: PlanTier): boolean {
  if (!isValidTier(current) || !isValidTier(target)) return false;
  return PLAN_MAP[target].rank > PLAN_MAP[current].rank;
}

/** Whether target is a lower tier than current. */
export function isDowngrade(current: PlanTier, target: PlanTier): boolean {
  if (!isValidTier(current) || !isValidTier(target)) return false;
  return PLAN_MAP[target].rank < PLAN_MAP[current].rank;
}

/** Whether the given tier is a known valid plan tier (safe against prototype keys). */
export function isValidTier(tier: string): tier is PlanTier {
  return Object.hasOwn(PLAN_MAP, tier);
}

/**
 * Features gained when moving from current to target plan.
 */
export function getUpgradeGains(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const currentFeatures = getCumulativeFeatures(currentTier);
  const targetFeatures = getCumulativeFeatures(targetTier);
  return targetFeatures.filter((f) => !currentFeatures.includes(f));
}

/**
 * Features lost when moving from current to target plan.
 */
export function getDowngradeLosses(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const currentFeatures = getCumulativeFeatures(currentTier);
  const targetFeatures = getCumulativeFeatures(targetTier);
  return currentFeatures.filter((f) => !targetFeatures.includes(f));
}
