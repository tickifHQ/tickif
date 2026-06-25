import { z } from 'zod';

/**
 * Shared contracts for the `projects` slice — the single source of truth for
 * request/response shapes, used by both the Hono API (validation + OpenAPI) and
 * the Next.js web app (typed fetch). Plain zod, no framework deps.
 */

export const projectStatus = z
  .enum(['draft', 'submitted', 'in_review', 'published', 'rejected', 'changes_requested'])
  .meta({ id: 'ProjectStatus' });
export type ProjectStatus = z.infer<typeof projectStatus>;

const taxonomySlug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a taxonomy slug such as modern or 3-bhk');

const completedMonth = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM format');

export const createProjectSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().max(5000).optional(),
    propertyTypeSlug: taxonomySlug.optional(),
    propertySubtypeSlug: taxonomySlug.optional(),
    scopeSlug: taxonomySlug.optional(),
    bhkSlug: taxonomySlug.optional(),
    sizeSqft: z.number().int().positive().max(100_000).optional(),
    citySlug: taxonomySlug.optional(),
    localitySlug: taxonomySlug.optional(),
    buildingName: z.string().trim().min(1).max(160).optional(),
    budgetBandSlug: taxonomySlug.optional(),
    completedMonth: completedMonth.optional(),
    durationMonths: z.number().int().positive().max(240).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'CreateProject' });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().max(5000).nullable().optional(),
    propertyTypeSlug: taxonomySlug.nullable().optional(),
    propertySubtypeSlug: taxonomySlug.nullable().optional(),
    scopeSlug: taxonomySlug.nullable().optional(),
    bhkSlug: taxonomySlug.nullable().optional(),
    sizeSqft: z.number().int().positive().max(100_000).nullable().optional(),
    citySlug: taxonomySlug.nullable().optional(),
    localitySlug: taxonomySlug.nullable().optional(),
    buildingName: z.string().trim().min(1).max(160).nullable().optional(),
    budgetBandSlug: taxonomySlug.nullable().optional(),
    completedMonth: completedMonth.nullable().optional(),
    durationMonths: z.number().int().positive().max(240).nullable().optional(),
    coverImageId: z.uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'UpdateProject' });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

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

export const updateProjectRoomSchema = z
  .object({
    roomTypeId: z.uuid().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    metadata: projectRoomMetadataSchema.optional(),
  })
  .meta({ id: 'UpdateProjectRoom' });
export type UpdateProjectRoomInput = z.infer<typeof updateProjectRoomSchema>;

export const reorderProjectRoomsSchema = z
  .object({
    rooms: z
      .array(
        z.object({
          id: z.uuid(),
          sortOrder: z.number().int().min(0),
        }),
      )
      .min(1)
      .superRefine((rooms, ctx) => {
        const seen = new Set<string>();
        for (const room of rooms) {
          if (seen.has(room.id)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Room ids must be unique',
              path: ['rooms'],
            });
            return;
          }
          seen.add(room.id);
        }
      }),
  })
  .meta({ id: 'ReorderProjectRooms' });
export type ReorderProjectRoomsInput = z.infer<typeof reorderProjectRoomsSchema>;

export const projectResponseSchema = z
  .object({
    id: z.uuid(),
    designerId: z.uuid(),
    title: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    status: projectStatus,
    propertyTypeSlug: z.string().nullable(),
    propertySubtypeSlug: z.string().nullable(),
    scopeSlug: z.string().nullable(),
    bhkSlug: z.string().nullable(),
    sizeSqft: z.number().int().nullable(),
    citySlug: z.string().nullable(),
    localitySlug: z.string().nullable(),
    buildingName: z.string().nullable(),
    budgetBandSlug: z.string().nullable(),
    completedMonth: z.string().nullable(),
    durationMonths: z.number().int().nullable(),
    coverImageId: z.uuid().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    publishedAt: z.string().datetime().nullable(),
    submittedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'Project' });
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectDetailResponseSchema = projectResponseSchema
  .extend({
    rooms: z.array(projectRoomSchema),
  })
  .meta({ id: 'ProjectDetail' });
export type ProjectDetailResponse = z.infer<typeof projectDetailResponseSchema>;

export const listProjectRoomsResponseSchema = z
  .object({ items: z.array(projectRoomSchema) })
  .meta({ id: 'ListProjectRooms' });
export type ListProjectRoomsResponse = z.infer<typeof listProjectRoomsResponseSchema>;

export const projectImageAttachmentSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    roomId: z.uuid().nullable(),
    status: z.enum(['processing', 'ready', 'failed']),
    sortOrder: z.number().int(),
  })
  .meta({ id: 'ProjectImageAttachment' });
export type ProjectImageAttachment = z.infer<typeof projectImageAttachmentSchema>;

export const linkProjectImageSchema = z
  .object({
    roomId: z.uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .meta({ id: 'LinkProjectImage' });
export type LinkProjectImageInput = z.infer<typeof linkProjectImageSchema>;

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

export const projectRoomIdParamSchema = z
  .object({ id: z.uuid(), roomId: z.uuid() })
  .meta({ id: 'ProjectRoomIdParam' });

export const projectImageIdParamSchema = z
  .object({ id: z.uuid(), imageId: z.uuid() })
  .meta({ id: 'ProjectImageIdParam' });

export const projectCompletenessRequirementSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    complete: z.boolean(),
  })
  .meta({ id: 'ProjectCompletenessRequirement' });
export type ProjectCompletenessRequirement = z.infer<typeof projectCompletenessRequirementSchema>;

export const projectCompletenessResponseSchema = z
  .object({
    complete: z.boolean(),
    score: z.number().int().min(0).max(100),
    missing: z.array(z.string()),
    requirements: z.array(projectCompletenessRequirementSchema),
  })
  .meta({ id: 'ProjectCompleteness' });
export type ProjectCompletenessResponse = z.infer<typeof projectCompletenessResponseSchema>;

export const deleteProjectResponseSchema = z
  .object({ id: z.uuid(), deleted: z.literal(true) })
  .meta({ id: 'DeleteProjectResponse' });
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;

export const deleteProjectRoomResponseSchema = z
  .object({ id: z.uuid(), deleted: z.literal(true) })
  .meta({ id: 'DeleteProjectRoomResponse' });
export type DeleteProjectRoomResponse = z.infer<typeof deleteProjectRoomResponseSchema>;
