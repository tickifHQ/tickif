import { z } from 'zod';
import { planTierSchema } from './billing';

export const billingRecoverySchema = z
  .object({
    id: z.uuid(),
    organizationId: z.string(),
    targetTier: planTierSchema,
    sourceSubscriptionId: z.string(),
    actorId: z.string().nullable(),
    status: z.enum([
      'requested',
      'waiting_for_expiry',
      'eligible',
      'checkout_pending',
      'completed',
      'dismissed',
      'superseded',
    ]),
    eligibleAt: z.iso.datetime().nullable(),
    reason: z.string().nullable(),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'BillingRecovery' });
export type BillingRecovery = z.infer<typeof billingRecoverySchema>;
export const billingRecoveryRequestSchema = z
  .object({
    targetTier: planTierSchema,
    expectedRevision: z.number().int().positive().nullable(),
    previewToken: z.string().min(1),
    operationId: z.uuid(),
  })
  .meta({ id: 'BillingRecoveryRequest' });
export type BillingRecoveryRequest = z.infer<typeof billingRecoveryRequestSchema>;
export const billingRecoveryDismissRequestSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .meta({ id: 'BillingRecoveryDismissRequest' });
export const billingRecoveryResponseSchema = z
  .object({ recovery: billingRecoverySchema.nullable() })
  .meta({ id: 'BillingRecoveryResponse' });
