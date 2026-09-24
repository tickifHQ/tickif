import { z } from 'zod';

const timestamp = z.number().int().nonnegative().nullable();

export const razorpayPlanSchema = z
  .object({
    id: z.string().min(1),
    entity: z.literal('plan'),
    interval: z.number().int().positive(),
    period: z.string().min(1),
    item: z.object({
      id: z.string(),
      name: z.string(),
      amount: z.number().int().nonnegative(),
      currency: z.string().length(3),
    }),
    created_at: z.number().int().nonnegative(),
  })
  .meta({ id: 'RazorpayPlan' });

export const razorpaySubscriptionSchema = z
  .object({
    id: z.string().min(1),
    entity: z.literal('subscription'),
    plan_id: z.string().min(1),
    status: z.string().min(1),
    current_start: timestamp,
    current_end: timestamp,
    short_url: z.string().nullable(),
    notes: z
      .union([z.record(z.string(), z.string()), z.array(z.never())])
      .transform((value) => (Array.isArray(value) ? {} : value))
      .optional(),
    cancel_at_cycle_end: z
      .union([z.boolean(), z.literal(0), z.literal(1)])
      .transform((value) => Boolean(value))
      .optional(),
    cancelled_at: timestamp.optional(),
    ended_at: timestamp.optional(),
    quantity: z.number().int().positive().optional(),
    payment_method: z.string().nullable().optional(),
    offer_id: z.string().nullable().optional(),
    has_scheduled_changes: z.boolean().optional(),
    change_scheduled_at: timestamp.optional(),
    charge_at: timestamp.optional(),
    created_at: z.number().int().nonnegative(),
  })
  .meta({ id: 'RazorpaySubscription' });

export type RazorpayPlan = z.infer<typeof razorpayPlanSchema>;
export type RazorpaySubscription = z.infer<typeof razorpaySubscriptionSchema>;
