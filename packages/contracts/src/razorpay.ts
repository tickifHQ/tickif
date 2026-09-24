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
    start_at: timestamp.optional(),
    created_at: z.number().int().nonnegative(),
  })
  .meta({ id: 'RazorpaySubscription' });

export type RazorpayPlan = z.infer<typeof razorpayPlanSchema>;
export type RazorpaySubscription = z.infer<typeof razorpaySubscriptionSchema>;

export const razorpayOrderSchema = z
  .object({
    id: z.string().min(1),
    amount: z.number().int().nonnegative(),
    amount_paid: z.number().int().nonnegative(),
    currency: z.string(),
    status: z.string(),
    receipt: z.string().nullable(),
  })
  .meta({ id: 'RazorpayOrder' });
export const razorpayPaymentSchema = z
  .object({
    id: z.string().min(1),
    order_id: z.string().nullable(),
    amount: z.number().int().nonnegative(),
    currency: z.string(),
    status: z.string(),
    amount_refunded: z.number().int().nonnegative().default(0),
    created_at: z.number().int(),
  })
  .meta({ id: 'RazorpayPayment' });
export const razorpayPaymentsSchema = z
  .object({ items: z.array(razorpayPaymentSchema) })
  .meta({ id: 'RazorpayPayments' });
export const razorpayInvoicesSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        subscription_id: z.string().nullable(),
        payment_id: z.string().nullable(),
        status: z.string(),
        billing_start: timestamp,
        billing_end: timestamp,
        amount_paid: z.number().int(),
        currency: z.string(),
      }),
    ),
  })
  .meta({ id: 'RazorpayInvoices' });
export const razorpayRefundsSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.string(),
        payment_id: z.string(),
        amount: z.number().int(),
        status: z.string(),
        receipt: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'RazorpayRefunds' });
