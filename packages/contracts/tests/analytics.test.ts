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
        window: {
          days: 7,
          from: '2026-08-01T00:00:00.000Z',
          to: '2026-08-07T12:00:00.000Z',
        },
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
        acquisitionSources: [{ source: 'project-enquiry', enquiries: 1, conversions: 1 }],
        deferredMetrics: [],
      }).success,
    ).toBe(true);
  });
});
