import { z } from 'zod';
import {
  planTierSchema,
  billingCheckoutResponseSchema,
  billingCancelResponseSchema,
} from './billing';
import { billingRecoverySchema } from './billing-recovery';

export const billingActionSchema = z
  .enum(['current', 'subscribe', 'change_plan', 'cancel', 'recover', 'blocked'])
  .meta({ id: 'BillingAction' });
export const billingTierActionSchema = z
  .object({
    targetTier: planTierSchema,
    action: billingActionSchema,
    reason: z.string().nullable(),
    effectiveAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'BillingTierAction' });
export const billingSelectionContextSchema = z
  .object({
    organizationId: z.string(),
    currentTier: planTierSchema,
    sourceSubscriptionId: z.string().nullable(),
    providerState: z.enum(['known', 'unknown']),
    actions: z.array(billingTierActionSchema),
    recovery: billingRecoverySchema.nullable(),
    scheduledChange: z
      .object({
        targetTier: planTierSchema.nullable(),
        effectiveAt: z.string().datetime().nullable(),
      })
      .nullable(),
    pendingOperation: z
      .object({
        operationId: z.uuid(),
        targetTier: planTierSchema,
        status: z.string(),
        reason: z.string(),
      })
      .nullable(),
    unfinishedCheckout: z
      .object({
        targetTier: planTierSchema.nullable(),
        status: z.string(),
        razorpaySubscriptionId: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'BillingSelectionContext' });
export type BillingSelectionContext = z.infer<typeof billingSelectionContextSchema>;
export const billingChangePreviewSchema = z
  .object({
    organizationId: z.string(),
    sourceSubscriptionId: z.string().nullable(),
    currentTier: planTierSchema,
    targetTier: planTierSchema,
    action: billingActionSchema,
    timing: z.enum(['now', 'cycle_end', 'after_expiry', 'unavailable']),
    effectiveAt: z.string().datetime().nullable(),
    nextRenewalAt: z.string().datetime().nullable(),
    nextEligibleAction: billingActionSchema.nullable(),
    nextEligibleAt: z.string().datetime().nullable(),
    reason: z.string().nullable(),
    recurringAmount: z.number().int().nonnegative().nullable(),
    adjustmentAmount: z.number().int().nonnegative().nullable(),
    currency: z.string().nullable(),
    amountCertainty: z.enum(['confirmed', 'estimated', 'unavailable']),
    adjustmentDirection: z.enum(['charge', 'refund', 'none', 'unknown']),
    confirmationAllowed: z.boolean(),
    expiresAt: z.string().datetime(),
    previewToken: z.string(),
  })
  .meta({ id: 'BillingChangePreview' });
export type BillingChangePreview = z.infer<typeof billingChangePreviewSchema>;
export const billingMutationRequestSchema = z
  .object({
    targetTier: planTierSchema,
    previewToken: z.string().min(1).max(4096),
    operationId: z.uuid(),
  })
  .meta({ id: 'BillingMutationRequest' });
export type BillingMutationRequest = z.infer<typeof billingMutationRequestSchema>;
export const billingMutationOutcomeSchema = z
  .object({
    operationId: z.uuid(),
    outcome: z.enum([
      'requested',
      'processing',
      'scheduled',
      'activated',
      'failed',
      'reconciliation_pending',
    ]),
    targetTier: planTierSchema,
    effectiveAt: z.string().datetime().nullable(),
    razorpaySubscriptionId: z.string(),
  })
  .meta({ id: 'BillingMutationOutcome' });
export type BillingMutationOutcome = z.infer<typeof billingMutationOutcomeSchema>;

export const billingSubscribeOutcomeSchema = billingCheckoutResponseSchema
  .extend(billingMutationOutcomeSchema.shape)
  .meta({ id: 'BillingSubscribeOutcome' });
export const billingCancelOutcomeSchema = billingCancelResponseSchema
  .extend(billingMutationOutcomeSchema.shape)
  .meta({ id: 'BillingCancelOutcome' });

export const billingReplacementCheckoutSchema = z
  .object({
    operationId: z.uuid(),
    status: z.string(),
    targetTier: planTierSchema,
    mandateAuthorized: z.boolean(),
    razorpaySubscriptionId: z.string().nullable(),
    razorpayOrderId: z.string().nullable(),
    amount: z.number().int().nonnegative(),
    currency: z.string(),
    effectiveAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    razorpayKeyId: z.string(),
  })
  .nullable()
  .meta({ id: 'BillingReplacementCheckout' });
export const billingReplacementVerifySchema = z
  .object({
    operationId: z.uuid(),
    kind: z.enum(['subscription', 'order']),
    providerId: z.string().min(1).max(100),
    paymentId: z.string().min(1).max(100),
    signature: z.string().min(1).max(128),
  })
  .meta({ id: 'BillingReplacementVerify' });
export type BillingReplacementVerify = z.infer<typeof billingReplacementVerifySchema>;
