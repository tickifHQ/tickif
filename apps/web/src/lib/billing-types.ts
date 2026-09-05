import type { PlanTier, SubscriptionState } from '@repo/contracts';

export type { PlanTier };
export type BillingLifecycleState = SubscriptionState;

/**
 * Display labels for plan tiers. Keep in sync with spec §1 names.
 */
export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  hobby: 'Hobby',
  professional_plus: 'Professional+',
  corporate: 'Corporate',
};

/**
 * Display prices in whole INR (rupees). The subscription table and
 * `payment_transaction.amount` store paise (₹2,999 → 299900). Convert at the
 * API boundary when E-239 provides real billing totals — do not forward these
 * values into `amount`.
 */
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
  /** Spec §1 is monthly only; the subscription table has no cycle column. */
  billingCycle: 'monthly' | null;
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
  /** Razorpay's raw subscription status (e.g., 'active', 'cancelled', 'created'). */
  razorpayStatus: string | null;
  /** Whether the subscription is scheduled for cancellation at the end of the current period. */
  cancellationScheduled: boolean;
  /**
   * Paid tier frozen at lapse. Required when `lifecycle === 'downgraded'`
   * (`plan_tier` is Hobby; restoration reads this).
   */
  preLapseTier: PlanTier | null;
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

/** Calendar date `days` from now (UTC), for mock data — never a literal year. */
export function isoDateOffsetDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
