import { z } from 'zod';
import { planTierSchema, subscriptionStateSchema } from './billing';
import { analyticsScopeSchema } from './entitlements';

export const analyticsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(90).default(30),
    branchId: z.string().min(1).optional(),
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

const analyticsAccessBaseSchema = z.object({
  tier: planTierSchema,
  lifecycleState: subscriptionStateSchema,
  tierScope: analyticsScopeSchema,
  level: z.enum(['organization', 'branch']),
  branchId: z.string().nullable(),
  branchAccess: z.enum(['available', 'upgrade_required', 'suspended']),
});

const ownerAnalyticsAccessSchema = analyticsAccessBaseSchema.extend({
  role: z.literal('owner'),
  roleScope: z.literal('full'),
  readOnly: z.literal(false),
  engagementVisible: z.literal(true),
});
const adminAnalyticsAccessSchema = analyticsAccessBaseSchema.extend({
  role: z.literal('admin'),
  roleScope: z.literal('full'),
  readOnly: z.literal(false),
  engagementVisible: z.literal(true),
});
const memberAnalyticsAccessSchema = analyticsAccessBaseSchema.extend({
  role: z.literal('member'),
  roleScope: z.literal('own'),
  readOnly: z.literal(false),
  engagementVisible: z.literal(true),
});
const viewerAnalyticsAccessSchema = analyticsAccessBaseSchema.extend({
  role: z.literal('viewer'),
  roleScope: z.literal('organization'),
  readOnly: z.literal(true),
  engagementVisible: z.literal(true),
});
const billingAnalyticsAccessSchema = analyticsAccessBaseSchema.extend({
  role: z.literal('billing_admin'),
  roleScope: z.literal('billing'),
  readOnly: z.literal(false),
  engagementVisible: z.literal(false),
});

type AnalyticsAccessInvariantInput = z.infer<typeof analyticsAccessBaseSchema>;

function validateAnalyticsAccess(
  access: AnalyticsAccessInvariantInput,
  ctx: z.core.$RefinementCtx<AnalyticsAccessInvariantInput>,
) {
  const reject = (message: string, path: string[]) =>
    ctx.addIssue({ code: 'custom', message, path, input: access });

  if (access.level === 'branch' && access.branchId === null) {
    reject('Branch-level analytics require a branch id', ['branchId']);
  }
  if (access.level === 'organization' && access.branchId !== null) {
    reject('Organization-level analytics cannot select a branch', ['branchId']);
  }
  if (access.branchAccess === 'available') {
    if (access.tier !== 'corporate' || access.tierScope !== 'branch' || access.lifecycleState === 'locked') {
      reject('Available branch analytics require an unlocked Corporate subscription', [
        'branchAccess',
      ]);
    }
  } else if (access.branchAccess === 'upgrade_required') {
    if (access.tier === 'corporate' || access.tierScope !== 'basic' || access.lifecycleState === 'locked') {
      reject('Upgrade-required branch analytics must use an unlocked basic tier', ['branchAccess']);
    }
  } else if (
    access.lifecycleState !== 'locked' ||
    access.tierScope !== 'basic' ||
    access.level !== 'organization' ||
    access.branchId !== null
  ) {
    reject('Suspended branch analytics require locked organization-level basic access', [
      'branchAccess',
    ]);
  }
  if (access.level === 'branch' && access.branchAccess !== 'available') {
    reject('Selected branch analytics must be available', ['branchAccess']);
  }
}

const engagementAnalyticsAccessSchema = z
  .discriminatedUnion('role', [
    ownerAnalyticsAccessSchema,
    adminAnalyticsAccessSchema,
    memberAnalyticsAccessSchema,
    viewerAnalyticsAccessSchema,
  ])
  .superRefine(validateAnalyticsAccess);

const checkedBillingAnalyticsAccessSchema = billingAnalyticsAccessSchema.superRefine(
  validateAnalyticsAccess,
);

const billingCurrencyAnalyticsSchema = z.object({
  currency: z.string().min(3).max(3),
  capturedAmount: z.number().int().nonnegative(),
  failedAmount: z.number().int().nonnegative(),
  transactionCount: z.number().int().nonnegative(),
  capturedTransactions: z.number().int().nonnegative(),
  failedTransactions: z.number().int().nonnegative(),
});

const billingAnalyticsSchema = z.object({
  currencies: z.array(billingCurrencyAnalyticsSchema),
  currentPeriodEnd: z.string().datetime().nullable(),
});

const branchAnalyticsSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1),
  projects: z.number().int().nonnegative(),
  enquiries: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
  projectViews: z.number().int().nonnegative(),
  profileViews: z.number().int().nonnegative(),
});

const frozenBranchSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1),
  frozenAt: z.string().datetime(),
  freezeRank: z.number().int().positive(),
});

const analyticsResponseBaseSchema = z.object({
  dataset: z.enum(['engagement', 'billing']),
  window: z.object({
    days: z.number().int().min(7).max(90),
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  frozenBranches: z.array(frozenBranchSchema),
});

const engagementAnalyticsResponseSchema = analyticsResponseBaseSchema
  .extend({
    dataset: z.literal('engagement'),
    access: engagementAnalyticsAccessSchema,
    billing: z.null(),
    branches: z.array(branchAnalyticsSchema),
    projects: projectMetricsSchema,
    leads: leadMetricsSchema,
    engagement: engagementMetricsSchema,
    previousPeriod: analyticsPeriodMetricsSchema,
    activity: z.array(analyticsActivityPointSchema),
    topConvertingProjects: z.array(topConvertingProjectSchema).max(4),
    acquisitionSources: z.array(acquisitionSourceSchema).max(4),
    deferredMetrics: z.array(deferredAnalyticsMetricSchema),
  })
  .meta({ id: 'EngagementAnalyticsResponse' });

const zeroProjectMetricsSchema = z.object({
  total: z.literal(0),
  draft: z.literal(0),
  submitted: z.literal(0),
  inReview: z.literal(0),
  published: z.literal(0),
  rejected: z.literal(0),
  changesRequested: z.literal(0),
});
const zeroLeadMetricsSchema = z.object({
  total: z.literal(0),
  new: z.literal(0),
  contacted: z.literal(0),
  closed: z.literal(0),
  spam: z.literal(0),
});
const zeroEngagementMetricsSchema = z.object({
  projectViews: z.literal(0),
  profileViews: z.literal(0),
});
const zeroPeriodMetricsSchema = z.object({
  projectViews: z.literal(0),
  enquiries: z.literal(0),
  viewToEnquiryRate: z.literal(0),
  responseRate: z.literal(0),
});
const zeroActivityPointSchema = z.object({
  date: z.iso.date(),
  projectsCreated: z.literal(0),
  leadsReceived: z.literal(0),
  projectViews: z.literal(0),
  profileViews: z.literal(0),
});

const billingAnalyticsResponseSchema = analyticsResponseBaseSchema
  .extend({
    dataset: z.literal('billing'),
    access: checkedBillingAnalyticsAccessSchema,
    billing: billingAnalyticsSchema,
    branches: z.tuple([]),
    projects: zeroProjectMetricsSchema,
    leads: zeroLeadMetricsSchema,
    engagement: zeroEngagementMetricsSchema,
    previousPeriod: zeroPeriodMetricsSchema,
    activity: z.array(zeroActivityPointSchema),
    topConvertingProjects: z.array(topConvertingProjectSchema).max(0),
    acquisitionSources: z.array(acquisitionSourceSchema).max(0),
    deferredMetrics: z.array(deferredAnalyticsMetricSchema).max(0),
  })
  .meta({ id: 'BillingAnalyticsResponse' });

export const analyticsResponseSchema = z
  .discriminatedUnion('dataset', [
    engagementAnalyticsResponseSchema,
    billingAnalyticsResponseSchema,
  ])
  .meta({ id: 'AnalyticsResponse' });
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
