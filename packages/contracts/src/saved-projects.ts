import { z } from 'zod';
import { feedProjectSchema } from './projects';

export const listSavedProjectsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(12),
  })
  .meta({ id: 'ListSavedProjectsQuery' });
export type ListSavedProjectsQuery = z.infer<typeof listSavedProjectsQuerySchema>;

export const listSavedProjectsResponseSchema = z
  .object({
    projects: z.array(feedProjectSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .meta({ id: 'ListSavedProjectsResponse' });
export type ListSavedProjectsResponse = z.infer<typeof listSavedProjectsResponseSchema>;

export const savedProjectParamSchema = z
  .object({ projectId: z.uuid() })
  .meta({ id: 'SavedProjectParam' });
export type SavedProjectParam = z.infer<typeof savedProjectParamSchema>;

export const savedProjectsStateQuerySchema = z
  .object({
    projectIds: z.union([z.uuid(), z.array(z.uuid()).min(1).max(48)]),
  })
  .meta({ id: 'SavedProjectsStateQuery' });
export type SavedProjectsStateQuery = z.infer<typeof savedProjectsStateQuerySchema>;

export const savedProjectStateSchema = z
  .object({
    projectId: z.uuid(),
    saved: z.boolean(),
  })
  .meta({ id: 'SavedProjectState' });
export type SavedProjectState = z.infer<typeof savedProjectStateSchema>;

export const savedProjectsStateResponseSchema = z
  .object({
    savedProjectIds: z.array(z.uuid()),
  })
  .meta({ id: 'SavedProjectsStateResponse' });
export type SavedProjectsStateResponse = z.infer<typeof savedProjectsStateResponseSchema>;
