import { z } from 'zod';
import { profileCompletionResponseSchema } from './profiles.js';
import { projectStatus } from './projects.js';

const dashboardActionStatus = z.enum(['complete', 'current', 'pending', 'attention']);

export const dashboardOverviewActionSchema = z
  .object({
    key: z.enum(['project-review', 'complete-profile']),
    title: z.string(),
    description: z.string(),
    status: dashboardActionStatus,
    href: z.string().nullable(),
  })
  .meta({ id: 'DashboardOverviewAction' });
export type DashboardOverviewAction = z.infer<typeof dashboardOverviewActionSchema>;

export const dashboardOverviewProjectReviewSchema = z
  .object({
    status: z.enum([
      'no_project',
      'draft',
      'pending_review',
      'in_review',
      'changes_requested',
      'published',
      'rejected',
    ]),
    title: z.string(),
    description: z.string(),
    sla: z.string().nullable(),
    project: z
      .object({
        id: z.uuid(),
        title: z.string(),
        status: projectStatus,
        submittedAt: z.string().datetime().nullable(),
        updatedAt: z.string().datetime(),
      })
      .nullable(),
  })
  .meta({ id: 'DashboardOverviewProjectReview' });

export const dashboardOverviewResponseSchema = z
  .object({
    header: z.object({
      title: z.string(),
      subtitle: z.string(),
    }),
    studio: z.object({
      profileId: z.uuid(),
      orgId: z.string(),
      orgSlug: z.string(),
      displayName: z.string(),
      location: z.string().nullable(),
      logoImageId: z.string().nullable(),
      status: z.string(),
      projectCount: z.number().int(),
      avgRating: z.string(),
      reviewCount: z.number().int(),
    }),
    profileCompletion: profileCompletionResponseSchema,
    projectReview: dashboardOverviewProjectReviewSchema,
    actions: z.array(dashboardOverviewActionSchema),
    portfolio: z.object({
      eyebrow: z.string(),
      title: z.string(),
      description: z.string(),
      displayName: z.string(),
      location: z.string().nullable(),
      publicPath: z.string(),
      copyText: z.string(),
      shareCount: z.number().int(),
    }),
  })
  .meta({ id: 'DashboardOverview' });
export type DashboardOverviewResponse = z.infer<typeof dashboardOverviewResponseSchema>;

export const dashboardOverviewShareResponseSchema = z
  .object({
    publicPath: z.string(),
    copyText: z.string(),
    shareCount: z.number().int(),
  })
  .meta({ id: 'DashboardOverviewShare' });
export type DashboardOverviewShareResponse = z.infer<typeof dashboardOverviewShareResponseSchema>;
