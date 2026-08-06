import { z } from 'zod';
import { projectReviewCommentSchema } from './review-comments';

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
      .record(z.string().trim().min(1).max(80), z.array(z.string().trim().min(1).max(80)).max(20))
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
    rejectionReasonCode: z.string().nullable(),
    moderationNote: z.string().nullable(),
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
    reviewComments: z.array(projectReviewCommentSchema),
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

export const projectListStatus = z
  .enum(['all', 'draft', 'in_review', 'published'])
  .default('all')
  .meta({ id: 'ProjectListStatus' });
export type ProjectListStatus = z.infer<typeof projectListStatus>;

export const projectListSort = z
  .enum(['-updatedAt', 'updatedAt', '-createdAt', 'createdAt', 'title', '-title'])
  .default('-updatedAt')
  .meta({ id: 'ProjectListSort' });
export type ProjectListSort = z.infer<typeof projectListSort>;

export const listProjectsQuerySchema = z
  .object({
    status: projectListStatus,
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    sort: projectListSort,
  })
  .meta({ id: 'ListProjectsQuery' });
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectListItemSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    propertyType: z.string().nullable(),
    city: z.string().nullable(),
    locality: z.string().nullable(),
    status: projectStatus,
    rejectionReasonCode: z.string().nullable(),
    moderationNote: z.string().nullable(),
    coverImageUrl: z.string().url().nullable(),
    reviewComments: z.array(projectReviewCommentSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ProjectListItem' });
export type ProjectListItem = z.infer<typeof projectListItemSchema>;

export const listProjectsResponseSchema = z
  .object({
    items: z.array(projectListItemSchema),
    page: z.number().int(),
    total: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'ProjectList' });
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;

export const portfolioProjectStatus = z
  .enum(['all', 'draft', 'in_review', 'published', 'changes_requested', 'rejected'])
  .default('all')
  .meta({ id: 'PortfolioProjectStatus' });
export type PortfolioProjectStatus = z.infer<typeof portfolioProjectStatus>;

export const portfolioProjectStatusGroup = z
  .enum(['draft', 'in_review', 'published', 'changes_requested', 'rejected'])
  .meta({ id: 'PortfolioProjectStatusGroup' });
export type PortfolioProjectStatusGroup = z.infer<typeof portfolioProjectStatusGroup>;

export const portfolioProjectsQuerySchema = z
  .object({
    status: portfolioProjectStatus,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    sort: projectListSort,
  })
  .meta({ id: 'PortfolioProjectsQuery' });
export type PortfolioProjectsQuery = z.infer<typeof portfolioProjectsQuerySchema>;

export const portfolioProjectItemSchema = projectListItemSchema
  .extend({
    statusGroup: portfolioProjectStatusGroup,
    coverImage: z
      .object({
        id: z.uuid(),
        url: z.string().url(),
        width: z.number().int(),
        height: z.number().int(),
      })
      .nullable(),
  })
  .meta({ id: 'PortfolioProjectItem' });
export type PortfolioProjectItem = z.infer<typeof portfolioProjectItemSchema>;

export const portfolioProjectStatusCountsSchema = z
  .object({
    total: z.number().int().min(0),
    draft: z.number().int().min(0),
    inReview: z.number().int().min(0),
    published: z.number().int().min(0),
    changesRequested: z.number().int().min(0),
    rejected: z.number().int().min(0),
  })
  .meta({ id: 'PortfolioProjectStatusCounts' });
export type PortfolioProjectStatusCounts = z.infer<typeof portfolioProjectStatusCountsSchema>;

export const portfolioProjectsResponseSchema = z
  .object({
    items: z.array(portfolioProjectItemSchema),
    statusCounts: portfolioProjectStatusCountsSchema,
    page: z.number().int(),
    total: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'PortfolioProjects' });
export type PortfolioProjectsResponse = z.infer<typeof portfolioProjectsResponseSchema>;

export const duplicateProjectResponseSchema = z
  .object({ project: projectDetailResponseSchema })
  .meta({ id: 'DuplicateProjectResponse' });
export type DuplicateProjectResponse = z.infer<typeof duplicateProjectResponseSchema>;

// --- Public feed (logged-out landing page) ----------------------------------

export const feedProjectsQuerySchema = z
  .object({
    // Bounded page: this is an unauthenticated route, so a huge page would push a
    // huge OFFSET onto Postgres (sort + discard the whole published set) per request.
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  })
  .meta({ id: 'FeedProjectsQuery' });
export type FeedProjectsQuery = z.infer<typeof feedProjectsQuerySchema>;

export const feedProjectSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    studio: z.string(),
    city: z.string().nullable(),
    locality: z.string().nullable(),
    rating: z.number(),
    reviewCount: z.number().int(),
    budget: z.string().nullable(),
    tags: z.array(z.string()),
    coverImageId: z.uuid().nullable(),
    coverImageUrl: z.string().url().nullable(),
    imageWidth: z.number().int().nullable(),
    imageHeight: z.number().int().nullable(),
  })
  .meta({ id: 'FeedProject' });
export type FeedProject = z.infer<typeof feedProjectSchema>;

export const feedProjectsResponseSchema = z
  .object({
    projects: z.array(feedProjectSchema),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
  })
  .meta({ id: 'FeedProjects' });
export type FeedProjectsResponse = z.infer<typeof feedProjectsResponseSchema>;

// --- Public project gallery --------------------------------------------------

export const galleryImageSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    roomName: z.string().nullable(),
  })
  .meta({ id: 'GalleryImage' });
export type GalleryImage = z.infer<typeof galleryImageSchema>;

export const galleryResponseSchema = z
  .object({
    images: z.array(galleryImageSchema),
  })
  .meta({ id: 'GalleryResponse' });
export type GalleryResponse = z.infer<typeof galleryResponseSchema>;

export const publicImageDetailParamSchema = z
  .object({ imageId: z.uuid() })
  .meta({ id: 'PublicImageDetailParam' });

export const publicImageDetailResponseSchema = z
  .object({
    project: feedProjectSchema,
    images: z.array(galleryImageSchema),
    activeImageId: z.uuid(),
  })
  .meta({ id: 'PublicImageDetail' });
export type PublicImageDetailResponse = z.infer<typeof publicImageDetailResponseSchema>;

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

export const deleteProjectImageResponseSchema = z
  .object({ id: z.uuid(), deleted: z.literal(true) })
  .meta({ id: 'DeleteProjectImageResponse' });
export type DeleteProjectImageResponse = z.infer<typeof deleteProjectImageResponseSchema>;

// --- Public read endpoints (E-195) ------------------------------------------

/** Designer summary card embedded in the public project-by-slug response. */
export const designerSummarySchema = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    slug: z.string().nullable(),
    avgRating: z.string(),
    reviewCount: z.number().int(),
    entityType: z.enum(['individual', 'company']),
    logoUrl: z.string().url().nullable(),
  })
  .meta({ id: 'DesignerSummary' });
export type DesignerSummary = z.infer<typeof designerSummarySchema>;

/** Slug path parameter for public project lookup. */
export const projectSlugParamSchema = z
  .object({ slug: z.string().trim().min(1).max(200) })
  .meta({ id: 'ProjectSlugParam' });

/**
 * GET /api/projects/slug/{slug} — published-only project detail.
 * Composed from existing schemas: project detail + designer summary + gallery.
 */
export const publicProjectBySlugResponseSchema = projectDetailResponseSchema
  .omit({
    designerId: true,
    coverImageId: true,
    metadata: true,
    submittedAt: true,
    updatedAt: true,
    rejectionReasonCode: true,
    moderationNote: true,
    reviewComments: true,
  })
  .extend({
    designer: designerSummarySchema,
    images: z.array(galleryImageSchema),
    coverImageUrl: z.string().url().nullable(),
  })
  .meta({ id: 'PublicProjectBySlug' });
export type PublicProjectBySlugResponse = z.infer<typeof publicProjectBySlugResponseSchema>;

// --- Designer's published projects (paginated) ---

/** GET /api/profiles/{id}/projects?page=&limit= — query params. */
export const designerProjectsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  })
  .meta({ id: 'DesignerProjectsQuery' });
export type DesignerProjectsQuery = z.infer<typeof designerProjectsQuerySchema>;

/**
 * Card projection for a single designer's portfolio grid.
 *
 * Extends the feed card with the three fields the public portfolio gallery
 * renders and sorts on. They stay off `feedProjectSchema` because the home feed
 * neither displays nor orders by them.
 */
export const designerProjectCardSchema = feedProjectSchema
  .extend({
    /** e.g. "4 BHK · Apartment" — composed from the bhk + property subtype labels. */
    propertyType: z.string().nullable(),
    /** Year the project was completed; falls back to the publish year. */
    completionYear: z.number().int().nullable(),
    sizeSqft: z.number().int().nullable(),
  })
  .meta({ id: 'DesignerProjectCard' });
export type DesignerProjectCard = z.infer<typeof designerProjectCardSchema>;

/** GET /api/profiles/{id}/projects — response. */
export const designerProjectsResponseSchema = z
  .object({
    projects: z.array(designerProjectCardSchema),
    page: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
  })
  .meta({ id: 'DesignerProjectsResponse' });
export type DesignerProjectsResponse = z.infer<typeof designerProjectsResponseSchema>;

// --- Similar projects ---

/**
 * GET /api/discovery/similar/{projectId} — response.
 * Rule-based: same city + room + budget band + scope. Limit 8.
 * Reuses `feedProjectSchema` for the card projection.
 */
export const similarProjectsResponseSchema = z
  .object({
    projects: z.array(feedProjectSchema),
  })
  .meta({ id: 'SimilarProjectsResponse' });
export type SimilarProjectsResponse = z.infer<typeof similarProjectsResponseSchema>;
