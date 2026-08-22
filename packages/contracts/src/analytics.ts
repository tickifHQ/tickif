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
  projectViews: z.number().int().nonnegative(),
  profileViews: z.number().int().nonnegative(),
});

const engagementMetricsSchema = z.object({
  projectViews: z
    .number()
    .int()
    .nonnegative()
    .describe('Daily unique project views within the requested analytics window'),
  profileViews: z
    .number()
    .int()
    .nonnegative()
    .describe('Daily unique profile views within the requested analytics window'),
});

const analyticsPeriodMetricsSchema = z.object({
  projectViews: z.number().int().nonnegative(),
  enquiries: z.number().int().nonnegative(),
  viewToEnquiryRate: z.number().nonnegative(),
  responseRate: z.number().nonnegative(),
});

const topConvertingProjectSchema = z.object({
  projectId: z.uuid(),
  title: z.string(),
  citySlug: z.string().nullable(),
  localitySlug: z.string().nullable(),
  views: z.number().int().nonnegative(),
  enquiries: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
});

const acquisitionSourceSchema = z.object({
  source: z.string(),
  enquiries: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
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
    engagement: engagementMetricsSchema,
    previousPeriod: analyticsPeriodMetricsSchema,
    activity: z.array(analyticsActivityPointSchema),
    topConvertingProjects: z.array(topConvertingProjectSchema).max(4),
    acquisitionSources: z.array(acquisitionSourceSchema).max(4),
    deferredMetrics: z.array(deferredAnalyticsMetricSchema),
  })
  .meta({ id: 'AnalyticsResponse' });
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
