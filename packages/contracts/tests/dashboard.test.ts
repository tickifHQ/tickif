import { describe, expect, it } from 'vitest';
import { dashboardOverviewResponseSchema } from '../src/dashboard.js';

describe('dashboard contracts', () => {
  it('accepts the overview aggregate without KYC fields', () => {
    const result = dashboardOverviewResponseSchema.safeParse({
      header: {
        title: 'Welcome, Studio Noir',
        subtitle: "Let's get your profile ready to go live.",
      },
      studio: {
        profileId: '11111111-1111-4111-8111-111111111111',
        orgId: 'org_1',
        orgSlug: 'studio-noir',
        displayName: 'Studio Noir',
        location: 'Indiranagar, Bangalore',
        logoImageId: null,
        status: 'active',
        projectCount: 1,
        avgRating: '0',
        reviewCount: 0,
      },
      profileCompletion: {
        score: 67,
        missing: ['logo', 'scope'],
        steps: [{ key: 'profile-completed', label: 'Complete your profile', done: false }],
      },
      projectReview: {
        status: 'pending_review',
        title: 'We review your project',
        description: 'A human check, usually within 24-48 hours.',
        sla: '24-48 hours',
        project: {
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Maitri Apartments',
          status: 'submitted',
          submittedAt: '2026-06-20T10:00:00.000Z',
          updatedAt: '2026-06-20T10:00:00.000Z',
        },
      },
      actions: [
        {
          key: 'project-review',
          title: 'We review your project',
          description: 'A human check, usually within 24-48 hours.',
          status: 'current',
          href: '/dashboard/projects/22222222-2222-4222-8222-222222222222',
        },
      ],
      portfolio: {
        eyebrow: 'One link. Everywhere.',
        title: 'A portfolio worth sharing.',
        description: 'This is your living portfolio.',
        displayName: 'Studio Noir',
        location: 'Indiranagar, Bangalore',
        publicPath: '/d/studio-noir',
        copyText: 'tickif.in/d/studio-noir',
        shareCount: 0,
      },
    });

    expect(result.success).toBe(true);
  });
});
