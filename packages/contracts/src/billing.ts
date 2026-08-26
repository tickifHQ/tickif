import { z } from 'zod';

/**
 * Plan tier — enum order is the ranking contract.
 * Corporate > Professional+ > Hobby.
 * Postgres enum values must be appended, never reordered.
 */
export const PLAN_TIER = {
  HOBBY: 'hobby',
  PROFESSIONAL_PLUS: 'professional_plus',
  CORPORATE: 'corporate',
} as const;

export const PLAN_TIER_VALUES = [
  PLAN_TIER.HOBBY,
  PLAN_TIER.PROFESSIONAL_PLUS,
  PLAN_TIER.CORPORATE,
] as const;

export const planTierSchema = z.enum(PLAN_TIER_VALUES).meta({ id: 'PlanTier' });
export type PlanTier = z.infer<typeof planTierSchema>;

/**
 * Subscription lifecycle state — separate from Razorpay's status.
 *
 * State machine:
 *   active → payment_failed → grace → locked → downgraded
 *   (can return to active from any lapsed state)
 *
 * E-114 only persists the state; the lifecycle engine is downstream.
 */
export const SUBSCRIPTION_STATE = {
  ACTIVE: 'active',
  PAYMENT_FAILED: 'payment_failed',
  GRACE: 'grace',
  LOCKED: 'locked',
  DOWNGRADED: 'downgraded',
} as const;

export const SUBSCRIPTION_STATE_VALUES = [
  SUBSCRIPTION_STATE.ACTIVE,
  SUBSCRIPTION_STATE.PAYMENT_FAILED,
  SUBSCRIPTION_STATE.GRACE,
  SUBSCRIPTION_STATE.LOCKED,
  SUBSCRIPTION_STATE.DOWNGRADED,
] as const;

export const subscriptionStateSchema = z
  .enum(SUBSCRIPTION_STATE_VALUES)
  .meta({ id: 'SubscriptionState' });
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;
