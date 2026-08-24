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
  price: number; // monthly INR (display only)
  features: string[];
};

export const PLANS: PlanDefinition[] = [
  {
    tier: 'hobby',
    label: 'Hobby',
    price: 0,
    features: ['1 Seat', '1 Studio', 'Unlimited Projects', 'Full Enquiry Visibility'],
  },
  {
    tier: 'professional_plus',
    label: 'Professional+',
    price: 2999,
    features: [
      '1 Seat',
      'Unlimited Projects',
      'Full Enquiry Visibility',
      'Verified Badge',
      'Discovery Priority',
      'Priority Support',
    ],
  },
  {
    tier: 'corporate',
    label: 'Corporate',
    price: 7999,
    features: [
      'Unlimited Members',
      'Unlimited Branches',
      'Branch Dashboards',
      'Full RBAC',
      'Prime Directory Placement',
      'Verified Badge',
      'Discovery Priority',
      'Priority Support',
    ],
  },
];

export const PLAN_MAP: Record<PlanTier, PlanDefinition> = {
  hobby: PLANS[0]!,
  professional_plus: PLANS[1]!,
  corporate: PLANS[2]!,
};

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

export function getPlanIndex(tier: PlanTier): number {
  return PLANS.findIndex((p) => p.tier === tier);
}

/** Whether target is a higher tier than current. Returns false for unknown/invalid tiers. */
export function isUpgrade(current: PlanTier, target: PlanTier): boolean {
  const currentIdx = getPlanIndex(current);
  const targetIdx = getPlanIndex(target);
  if (currentIdx === -1 || targetIdx === -1) return false;
  return targetIdx > currentIdx;
}

/** Whether the given tier is a known valid plan tier. */
export function isValidTier(tier: string): tier is PlanTier {
  return tier in PLAN_MAP;
}

/**
 * Features lost when moving from current to target plan.
 * Derived from the feature list difference — not a separate manual list.
 */
export function getDowngradeLosses(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];
  return current.features.filter((f) => !target.features.includes(f));
}

/**
 * Features gained when moving from current to target plan.
 */
export function getUpgradeGains(currentTier: PlanTier, targetTier: PlanTier): string[] {
  const current = PLAN_MAP[currentTier];
  const target = PLAN_MAP[targetTier];
  return target.features.filter((f) => !current.features.includes(f));
}
