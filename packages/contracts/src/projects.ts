import { z } from 'zod';

/**
 * Shared contracts for the `projects` slice — the single source of truth for
 * request/response shapes, used by both the Hono API (validation + OpenAPI) and
 * the Next.js web app (typed fetch). Plain zod, no framework deps.
 */

export const projectStatus = z
  .enum(['draft', 'submitted', 'in_review', 'published', 'rejected'])
  .meta({ id: 'ProjectStatus' });
export type ProjectStatus = z.infer<typeof projectStatus>;

export const createProjectSchema = z
  .object({
    designerId: z.uuid(),
    title: z.string().min(3).max(160),
    description: z.string().max(5000).optional(),
    citySlug: z.string().min(1).max(80).optional(),
    budgetBandSlug: z.string().min(1).max(80).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'CreateProject' });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const projectRoomMetadataSchema = z
  .object({
    labels: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    attributeLabels: z
      .record(
        z.string().trim().min(1).max(80),
        z.array(z.string().trim().min(1).max(80)).max(20),
      )
      .refine((value) => Object.keys(value).length <= 20, {
        message: 'attributeLabels can contain at most 20 entries',
      })
      .optional(),
  })
  .catchall(z.unknown())
  .meta({ id: 'ProjectRoomMetadata' });
export type ProjectRoomMetadata = z.infer<typeof projectRoomMetadataSchema>;

export const projectRoomSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    roomTypeId: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
    metadata: projectRoomMetadataSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectRoom' });
export type ProjectRoom = z.infer<typeof projectRoomSchema>;

export const createProjectRoomSchema = z
  .object({
    roomTypeId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).optional(),
    metadata: projectRoomMetadataSchema.optional(),
  })
  .meta({ id: 'CreateProjectRoom' });
export type CreateProjectRoomInput = z.infer<typeof createProjectRoomSchema>;

export const projectResponseSchema = z
  .object({
    id: z.uuid(),
    designerId: z.uuid(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: projectStatus,
    citySlug: z.string().nullable(),
    budgetBandSlug: z.string().nullable(),
    coverImageId: z.uuid().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    publishedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'Project' });
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const listProjectsQuerySchema = z
  .object({
    status: projectStatus.optional(),
    citySlug: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .meta({ id: 'ListProjectsQuery' });
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const listProjectsResponseSchema = z
  .object({
    items: z.array(projectResponseSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .meta({ id: 'ProjectList' });
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;

export const projectIdParamSchema = z.object({ id: z.uuid() }).meta({ id: 'ProjectIdParam' });
