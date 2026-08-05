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

  it('accepts real metrics while keeping event-backed metrics explicitly deferred', () => {
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
        activity: [{ date: '2026-08-07', projectsCreated: 1, leadsReceived: 1 }],
        deferredMetrics: [
          {
            key: 'profileViews',
            label: 'Profile views',
            reason: 'Requires the Phase 3 interaction event pipeline.',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
