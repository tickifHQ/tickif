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

/**
 * Razorpay webhook event types relevant to subscription billing.
 *
 * These map to Razorpay's event names as delivered in the webhook payload's
 * `event` field. Only subscription-related events are handled by E-117.
 */
export const RAZORPAY_EVENT = {
  SUBSCRIPTION_ACTIVATED: 'subscription.activated',
  SUBSCRIPTION_CHARGED: 'subscription.charged',
  PAYMENT_FAILED: 'payment.failed',
  SUBSCRIPTION_PENDING: 'subscription.pending',
  SUBSCRIPTION_HALTED: 'subscription.halted',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
} as const;

export const RAZORPAY_EVENT_VALUES = [
  RAZORPAY_EVENT.SUBSCRIPTION_ACTIVATED,
  RAZORPAY_EVENT.SUBSCRIPTION_CHARGED,
  RAZORPAY_EVENT.PAYMENT_FAILED,
  RAZORPAY_EVENT.SUBSCRIPTION_PENDING,
  RAZORPAY_EVENT.SUBSCRIPTION_HALTED,
  RAZORPAY_EVENT.SUBSCRIPTION_CANCELLED,
] as const;

export const razorpayEventSchema = z.enum(RAZORPAY_EVENT_VALUES).meta({ id: 'RazorpayEvent' });
export type RazorpayEvent = z.infer<typeof razorpayEventSchema>;

/** Razorpay payment entity creation time in Unix seconds. */
export const razorpayPaymentCreatedAtSchema = z
  .number()
  .int()
  .nonnegative()
  .max(8_640_000_000_000)
  .meta({ id: 'RazorpayPaymentCreatedAt' });

export const billingPlanRequestSchema = z
  .object({ targetTier: planTierSchema })
  .meta({ id: 'BillingPlanRequest' });
export const billingCheckoutResponseSchema = z
  .object({
    razorpaySubscriptionId: z.string(),
    shortUrl: z.string().nullable(),
    razorpayKeyId: z.string(),
    prefill: z.object({
      name: z.string().nullable(),
      email: z.string().nullable(),
      contact: z.string().nullable(),
    }),
  })
  .meta({ id: 'BillingCheckoutResponse' });
export type BillingCheckoutResponse = z.infer<typeof billingCheckoutResponseSchema>;
export const billingPlanResponseSchema = z
  .object({ razorpaySubscriptionId: z.string() })
  .meta({ id: 'BillingPlanResponse' });
export const billingCancelResponseSchema = billingPlanResponseSchema
  .extend({
    alreadyCancelled: z.boolean(),
    currentPeriodEnd: z.string().datetime().nullable(),
  })
  .meta({ id: 'BillingCancelResponse' });
export const billingVerifyRequestSchema = z
  .object({
    razorpayPaymentId: z.string().min(1).max(100),
    razorpaySubscriptionId: z.string().min(1).max(100),
    razorpaySignature: z.string().min(1).max(128),
  })
  .meta({ id: 'BillingVerifyRequest' });
export type BillingVerifyRequest = z.infer<typeof billingVerifyRequestSchema>;
export const billingVerifyResponseSchema = z
  .object({ verified: z.boolean() })
  .meta({ id: 'BillingVerifyResponse' });
export const billingRefreshResponseSchema = z
  .object({
    reconciled: z.boolean(),
    razorpayStatus: z.string().nullable(),
  })
  .meta({ id: 'BillingRefreshResponse' });
export const billingPaymentsQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'BillingPaymentsQuery' });
export const billingPaymentsResponseSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        amount: z.number().int().nonnegative(),
        currency: z.string(),
        status: z.string(),
        occurredAt: z.string().datetime(),
      }),
    ),
    nextOffset: z.number().int().nullable(),
  })
  .meta({ id: 'BillingPaymentsResponse' });
export type BillingPaymentsResponse = z.infer<typeof billingPaymentsResponseSchema>;
