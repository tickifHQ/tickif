import { z } from 'zod';
import { planTierSchema } from './billing';

/** Public display catalogue; provider IDs and organization state stay private. */
export const billingCatalogPlanSchema = z
  .object({
    tier: planTierSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    amountPaise: z.number().int().nonnegative(),
    currency: z.literal('INR'),
    interval: z.literal('monthly'),
    features: z.array(z.string().min(1)),
  })
  .meta({ id: 'BillingCatalogPlan' });

export const billingCatalogResponseSchema = z
  .object({
    plans: z.array(billingCatalogPlanSchema),
    earlyBird: z
      .object({
        months: z.number().int().positive(),
        claimBefore: z.string().datetime(),
        cardRequired: z.literal(false),
      })
      .nullable(),
  })
  .meta({ id: 'BillingCatalogResponse' });

export type BillingCatalogPlan = z.infer<typeof billingCatalogPlanSchema>;
export type BillingCatalogResponse = z.infer<typeof billingCatalogResponseSchema>;
