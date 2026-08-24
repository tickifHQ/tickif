/**
 * Billing lifecycle types for E-179.
 *
 * These types define the frontend data contract for the Plan & Billing page.
 * When the billing API (E-119/E-239) is implemented, replace the temporary
 * adapter in billing-data.ts with real API calls — the component layer
 * remains unchanged.
 */

export type BillingLifecycleState =
  | 'active'
  | 'payment_failed'
  | 'grace'
  | 'locked'
  | 'downgraded';

export type PlanTier = 'hobby' | 'professional_plus' | 'corporate';

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  hobby: 'Hobby',
  professional_plus: 'Professional+',
  corporate: 'Corporate',
};

export const PLAN_TIER_PRICES: Record<PlanTier, number> = {
  hobby: 0,
  professional_plus: 2999,
  corporate: 7999,
};

export type UsageMetric = {
  label: string;
  current: number;
  limit: number | null; // null = unlimited
  unit: string;
};

export type BillingInfo = {
  nextBillingDate: string | null;
  billingCycle: 'monthly' | 'yearly' | null;
  planAmount: number;
  tax: number;
  total: number;
  paymentMethodLast4: string | null;
  paymentMethodBrand: string | null;
};

export type FrozenResource = {
  label: string;
  quantity: number;
  recoverable: boolean;
};

export type BillingState = {
  lifecycle: BillingLifecycleState;
  tier: PlanTier;
  renewalDate: string | null;
  subscriptionId: string | null;
  usage: {
    seats: UsageMetric;
    branches: UsageMetric;
  };
  billing: BillingInfo | null;
  /** Grace period: days remaining before lock. null if not in grace. */
  graceDaysRemaining: number | null;
  /** Locked period: days remaining before downgrade. null if not locked. */
  lockedDaysRemaining: number | null;
  /** Payment failed: date of last failed attempt. */
  lastPaymentFailedDate: string | null;
  /** Downgraded: frozen resources that are recoverable. */
  frozenResources: FrozenResource[];
  /** What is still accessible in locked state. */
  lockedAccess: {
    suspended: string[];
    available: string[];
  } | null;
};
