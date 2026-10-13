import { z } from 'zod';

export const followingIdParamSchema = z
  .object({ designerProfileId: z.uuid() })
  .meta({ id: 'FollowingIdParam' });
export const followingQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'FollowingQuery' });
export const followingSeenSchema = z
  .object({ seenThrough: z.string().datetime() })
  .meta({ id: 'FollowingSeen' });
export const followingStateSchema = z
  .object({
    designerProfileId: z.uuid(),
    following: z.boolean(),
  })
  .meta({ id: 'FollowingState' });
export const followedDesignerSchema = z
  .object({
    designerProfileId: z.uuid(),
    displayName: z.string(),
    slug: z.string(),
    logoUrl: z.url().nullable(),
    portfolioAvailable: z.boolean(),
    newProjectCount: z.number().int().nonnegative(),
    followedAt: z.string().datetime(),
  })
  .meta({ id: 'FollowedDesigner' });
export const followingListSchema = z
  .object({
    items: z.array(followedDesignerSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'FollowingList' });
export type FollowingQuery = z.infer<typeof followingQuerySchema>;
export type FollowingState = z.infer<typeof followingStateSchema>;
export type FollowingSeen = z.infer<typeof followingSeenSchema>;
export type FollowingList = z.infer<typeof followingListSchema>;
