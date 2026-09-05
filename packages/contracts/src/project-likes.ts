import { z } from 'zod';

export const projectLikeParamSchema = z.object({ projectId: z.uuid() })
  .meta({ id: 'ProjectLikeParam' });

export const projectLikesStateQuerySchema = z.object({
  projectIds: z.union([z.uuid(), z.array(z.uuid()).min(1).max(48)]),
}).meta({ id: 'ProjectLikesStateQuery' });
export type ProjectLikesStateQuery = z.infer<typeof projectLikesStateQuerySchema>;

export const projectLikeStateSchema = z.object({
  projectId: z.uuid(),
  likeCount: z.number().int().nonnegative(),
  liked: z.boolean(),
}).meta({ id: 'ProjectLikeState' });
export type ProjectLikeState = z.infer<typeof projectLikeStateSchema>;

export const projectLikesStateResponseSchema = z.object({
  projects: z.array(projectLikeStateSchema),
}).meta({ id: 'ProjectLikesStateResponse' });
export type ProjectLikesStateResponse = z.infer<typeof projectLikesStateResponseSchema>;
