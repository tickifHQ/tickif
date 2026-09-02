import { describe, expect, it } from 'vitest';
import { analyticsQuerySchema, analyticsResponseSchema } from '../src/analytics.js';

describe('analytics contracts', () => {
  it('defaults the analytics window to 30 days', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ days: 30 });
  });

  it('coerces valid windows and rejects unsupported ranges', () => {
    expect(analyticsQuerySchema.parse({ days: '7' })).toEqual({ days: 7 });
    expect(analyticsQuerySchema.safeParse({ days: '6' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ days: '91' }).success).toBe(false);
  });

  it('accepts real metrics including event-backed engagement', () => {
    expect(
      analyticsResponseSchema.safeParse({
        dataset: 'engagement',
        window: {
          days: 7,
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-07T12:00:00.000Z',
        },
        access: {
          role: 'owner',
          roleScope: 'full',
          tier: 'corporate',
          lifecycleState: 'active',
          tierScope: 'branch',
          level: 'organization',
          branchId: null,
          branchAccess: 'available',
          readOnly: false,
          engagementVisible: true,
        },
        billing: null,
        branches: [],
        frozenBranches: [],
        projects: {
          total: 2,
          draft: 1,
          submitted: 0,
          inReview: 0,
          published: 1,
          rejected: 0,
          changesRequested: 0,
        },
        leads: { total: 1, new: 1, contacted: 0, closed: 0, spam: 0 },
        engagement: { projectViews: 3, profileViews: 2 },
        previousPeriod: {
          projectViews: 2,
          enquiries: 1,
          viewToEnquiryRate: 50,
          responseRate: 0,
        },
        activity: [
          {
            date: '2026-08-07',
            projectsCreated: 1,
            leadsReceived: 1,
            projectViews: 3,
            profileViews: 2,
          },
        ],
        topConvertingProjects: [
          {
            projectId: '11111111-1111-4111-8111-111111111111',
            title: 'Warm apartment',
            citySlug: 'chennai',
            localitySlug: 'velachery',
            views: 3,
            enquiries: 1,
            conversions: 1,
          },
        ],
        acquisitionSources: [{ source: 'enquiry', enquiries: 1, conversions: 1 }],
        deferredMetrics: [],
      }).success,
    ).toBe(true);
  });

  it('rejects engagement fields in the billing dataset unless compatibility values are zero', () => {
    const billing = {
      dataset: 'billing',
      window: {
        days: 7,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-07T12:00:00.000Z',
      },
      access: {
        role: 'billing_admin',
        roleScope: 'billing',
        tier: 'corporate',
        lifecycleState: 'active',
        tierScope: 'branch',
        level: 'organization',
        branchId: null,
        branchAccess: 'available',
        readOnly: false,
        engagementVisible: false,
      },
      billing: { currencies: [], currentPeriodEnd: null },
      branches: [],
      frozenBranches: [],
      projects: {
        total: 0,
        draft: 0,
        submitted: 0,
        inReview: 0,
        published: 0,
        rejected: 0,
        changesRequested: 0,
      },
      leads: { total: 0, new: 0, contacted: 0, closed: 0, spam: 0 },
      engagement: { projectViews: 0, profileViews: 0 },
      previousPeriod: { projectViews: 0, enquiries: 0, viewToEnquiryRate: 0, responseRate: 0 },
      activity: [],
      topConvertingProjects: [],
      acquisitionSources: [],
      deferredMetrics: [],
    } as const;

    expect(analyticsResponseSchema.safeParse(billing).success).toBe(true);
    expect(
      analyticsResponseSchema.safeParse({
        ...billing,
        engagement: { projectViews: 1, profileViews: 0 },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...billing,
        dataset: 'engagement',
        billing: { currencies: [], currentPeriodEnd: null },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...billing,
        access: { ...billing.access, role: 'owner', roleScope: 'full' },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...billing,
        access: { ...billing.access, engagementVisible: true },
      }).success,
    ).toBe(false);
  });

  it('rejects impossible engagement role and scope mappings', () => {
    const valid = {
      dataset: 'engagement',
      window: {
        days: 7,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-07T12:00:00.000Z',
      },
      access: {
        role: 'viewer',
        roleScope: 'organization',
        tier: 'corporate',
        lifecycleState: 'active',
        tierScope: 'branch',
        level: 'organization',
        branchId: null,
        branchAccess: 'available',
        readOnly: true,
        engagementVisible: true,
      },
      billing: null,
      branches: [],
      frozenBranches: [],
      projects: {
        total: 0,
        draft: 0,
        submitted: 0,
        inReview: 0,
        published: 0,
        rejected: 0,
        changesRequested: 0,
      },
      leads: { total: 0, new: 0, contacted: 0, closed: 0, spam: 0 },
      engagement: { projectViews: 0, profileViews: 0 },
      previousPeriod: { projectViews: 0, enquiries: 0, viewToEnquiryRate: 0, responseRate: 0 },
      activity: [],
      topConvertingProjects: [],
      acquisitionSources: [],
      deferredMetrics: [],
    } as const;
    expect(analyticsResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, roleScope: 'full' },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, role: 'billing_admin', roleScope: 'billing', readOnly: false },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, branchId: 'team_1' },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, level: 'branch', branchId: null },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: {
          ...valid.access,
          tier: 'professional_plus',
          tierScope: 'basic',
          level: 'branch',
          branchId: 'team_1',
          branchAccess: 'upgrade_required',
        },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, tierScope: 'basic' },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, lifecycleState: 'locked' },
      }).success,
    ).toBe(false);
    expect(
      analyticsResponseSchema.safeParse({
        ...valid,
        access: { ...valid.access, level: 'branch', branchId: 'team_1' },
      }).success,
    ).toBe(true);
  });
});
