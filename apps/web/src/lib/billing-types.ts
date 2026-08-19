/**
 * Billing lifecycle types for E-179.
 *
 * These types define the frontend data contract for the Plan & Billing page.
 * When the billing API (E-71, E-114, E-119, E-239) is implemented, replace
 * the temporary adapter in billing-data.ts with real API calls — the component
 * layer remains unchanged.
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
    /** Branches: only relevant for Corporate tier. */
    branches?: UsageMetric;
  };
  billing: BillingInfo | null;
  /** Grace period: days remaining before lock. */
  graceDaysRemaining: number | null;
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

/** Role-based access: only owner and billing_admin can view billing. */
export type BillingAccessRole = 'owner' | 'billing_admin';

/** Organization role for billing access control. */
export type OrgRole = 'owner' | 'billing_admin' | 'admin' | 'member' | 'viewer';
