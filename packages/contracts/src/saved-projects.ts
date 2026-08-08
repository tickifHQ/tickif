import { z } from 'zod';

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
