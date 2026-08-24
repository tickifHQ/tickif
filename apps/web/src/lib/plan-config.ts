/**
 * E-120 plan configuration — local frontend definitions.
 *
 * These plan definitions power the Subscribe / Upgrade UI flow.
 * When E-114's shared billing contract (@repo/contracts) is available via rebase,
 * replace PlanTier and PLANS with the canonical backend-driven definitions.
 *
 * Prices are in whole INR (rupees) for display purposes.
 * The backend (E-114) stores amounts in paise — conversion happens at the
 * API boundary when E-239 provides real billing totals.
 */

export type PlanTier = 'hobby' | 'professional_plus' | 'corporate';

export type PlanDefinition = {
  tier: PlanTier;
  label: string;
  /** Explicit tier rank. Higher = more features. Used for upgrade/downgrade logic. */
  rank: number;
  price: number; // monthly INR (display only)
  /**
   * Base features unique to this tier (not inherited from lower tiers).
   * The full feature set for a tier is the union of its own baseFeatures
   * plus all baseFeatures from lower-ranked tiers.
   */
  baseFeatures: string[];
};

/**
 * Plan definitions ordered by rank.
 * Each tier's full entitlement set = its baseFeatures + all lower tiers' baseFeatures.
 */
export const PLANS: PlanDefinition[] = [
  {
    tier: 'hobby',
    label: 'Hobby',
    rank: 0,
    price: 0,
    baseFeatures: ['1 Seat', '1 Studio', 'Unlimited Projects', 'Full Enquiry Visibility'],
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
      'Unlimited Members',
      'Unlimited Branches',
      'Branch Dashboards',
      'Full RBAC',
      'Prime Directory Placement',
    ],
  },
];

/** Lookup by tier key. Never relies on array position. */
export const PLAN_MAP: Record<PlanTier, PlanDefinition> = Object.fromEntries(
  PLANS.map((p) => [p.tier, p]),
) as Record<PlanTier, PlanDefinition>;

/** Estimated tax rate for display/preview only. Not a billing calculation. */
export const ESTIMATED_TAX_RATE = 0.18;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
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

/** Whether target is a higher tier than current. Uses explicit rank, not array position. */
export function isUpgrade(current: PlanTier, target: PlanTier): boolean {
  if (!isValidTier(current) || !isValidTier(target)) return false;
  return PLAN_MAP[target].rank > PLAN_MAP[current].rank;
}

/** Whether the given tier is a known valid plan tier (safe against prototype keys). */
export function isValidTier(tier: string): tier is PlanTier {
  return Object.hasOwn(PLAN_MAP, tier);
}

/**
 * Features lost when moving from current to target plan.
 * Derived from the cumulative feature sets of both tiers.
 */
export function getDowngradeLosses(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const currentFeatures = getCumulativeFeatures(currentTier);
  const targetFeatures = getCumulativeFeatures(targetTier);
  return currentFeatures.filter((f) => !targetFeatures.includes(f));
}

/**
 * Features gained when moving from current to target plan.
 * Derived from the cumulative feature sets of both tiers.
 */
export function getUpgradeGains(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const currentFeatures = getCumulativeFeatures(currentTier);
  const targetFeatures = getCumulativeFeatures(targetTier);
  return targetFeatures.filter((f) => !currentFeatures.includes(f));
}
