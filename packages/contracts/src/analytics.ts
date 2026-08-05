import { z } from 'zod';

export const analyticsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(90).default(30),
  })
  .meta({ id: 'AnalyticsQuery' });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

const projectMetricsSchema = z.object({
  total: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  inReview: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  changesRequested: z.number().int().nonnegative(),
});

const leadMetricsSchema = z.object({
  total: z.number().int().nonnegative(),
  new: z.number().int().nonnegative(),
  contacted: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
  spam: z.number().int().nonnegative(),
});

const analyticsActivityPointSchema = z.object({
  date: z.iso.date(),
  projectsCreated: z.number().int().nonnegative(),
  leadsReceived: z.number().int().nonnegative(),
});

const deferredAnalyticsMetricSchema = z.object({
  key: z.enum(['profileViews', 'projectViews']),
  label: z.string(),
  reason: z.string(),
});

export const analyticsResponseSchema = z
  .object({
    window: z.object({
      days: z.number().int().min(7).max(90),
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
    projects: projectMetricsSchema,
    leads: leadMetricsSchema,
    activity: z.array(analyticsActivityPointSchema),
    deferredMetrics: z.array(deferredAnalyticsMetricSchema),
  })
  .meta({ id: 'AnalyticsResponse' });
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
