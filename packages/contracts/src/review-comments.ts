import { z } from 'zod';

export const projectReviewCommentStatusSchema = z
  .enum(['unresolved', 'resolved'])
  .meta({ id: 'ProjectReviewCommentStatus' });
export type ProjectReviewCommentStatus = z.infer<typeof projectReviewCommentStatusSchema>;

export const projectReviewCommentSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    authorLabel: z.literal('Tickif Review Team'),
    body: z.string(),
    status: projectReviewCommentStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectReviewComment' });
export type ProjectReviewComment = z.infer<typeof projectReviewCommentSchema>;

export const projectReviewCommentsResponseSchema = z
  .object({ items: z.array(projectReviewCommentSchema) })
  .meta({ id: 'ProjectReviewComments' });
export type ProjectReviewCommentsResponse = z.infer<typeof projectReviewCommentsResponseSchema>;

export const createProjectReviewCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'CreateProjectReviewComment' });
export type CreateProjectReviewCommentInput = z.infer<typeof createProjectReviewCommentSchema>;

export const updateProjectReviewCommentSchema = z
  .object({
    status: projectReviewCommentStatusSchema,
  })
  .meta({ id: 'UpdateProjectReviewComment' });
export type UpdateProjectReviewCommentInput = z.infer<typeof updateProjectReviewCommentSchema>;

export const projectReviewCommentParamsSchema = z
  .object({
    id: z.uuid(),
    commentId: z.uuid(),
  })
  .meta({ id: 'ProjectReviewCommentParams' });
