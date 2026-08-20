/**
 * E-120 plan configuration — temporary frontend definitions.
 *
 * These plan definitions power the Subscribe / Upgrade UI flow.
 * When the shared billing contract (E-119) is available, replace these
 * with the canonical backend-driven plan data.
 */

export type PlanTier = 'hobby' | 'professional_plus' | 'corporate';

export type PlanDefinition = {
  tier: PlanTier;
  label: string;
  price: number; // monthly INR
  popular?: boolean;
  features: string[];
  /** Features the user LOSES when downgrading FROM this plan. */
  exclusiveFeatures: string[];
};

export const PLANS: PlanDefinition[] = [
  {
    tier: 'hobby',
    label: 'Hobby',
    price: 0,
    features: [
      '1 Seat',
      '1 Studio',
      'Unlimited Projects',
      'Full Enquiry Visibility',
    ],
    exclusiveFeatures: [],
  },
  {
    tier: 'professional_plus',
    label: 'Professional+',
    price: 2999,
    popular: true,
    features: [
      '1 Seat',
      'Unlimited Projects',
      'Verified Badge',
      'Discovery Priority',
      'Priority Support',
    ],
    exclusiveFeatures: [
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
    ],
    exclusiveFeatures: [
      'Unlimited Members',
      'Unlimited Branches',
      'Branch Dashboards & Analytics',
      'Full RBAC & Collaboration',
      'Prime Directory Placement',
    ],
  },
];

export const PLAN_MAP: Record<PlanTier, PlanDefinition> = {
  hobby: PLANS[0]!,
  professional_plus: PLANS[1]!,
  corporate: PLANS[2]!,
};

/** Mock tax rate — replace with backend billing calculation when available. */
export const MOCK_TAX_RATE = 0.18;

/** Mock payment method — replace with real payment method from billing API. */
export const MOCK_PAYMENT_METHOD = {
  brand: 'Visa',
  last4: '4242',
};

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

export function isUpgrade(current: PlanTier, target: PlanTier): boolean {
  return getPlanIndex(target) > getPlanIndex(current);
}
