import { z } from 'zod';
import { projectCompletenessResponseSchema, projectRoomSchema, projectStatus } from './projects';
import { projectReviewCommentSchema } from './review-comments';

export const moderationAction = z
  .enum([
    'submit',
    'resubmit',
    'withdraw',
    'start_review',
    'publish',
    'request_changes',
    'reject',
    'unpublish',
    'metadata_corrected',
  ])
  .meta({ id: 'ModerationAction' });
export type ModerationAction = z.infer<typeof moderationAction>;

/**
 * Actions a designer takes on their own project. These carry no reviewer verdict, so a
 * project whose history is only self-service churn (submit, then withdraw) is still the
 * designer's to delete. Every other action means an admin looked at the project, and that
 * decision has to outlive the draft.
 *
 * Typed as `ModerationAction[]` so adding an enum member without classifying it here is a
 * compile error rather than a silent promotion to "admin action".
 */
export const SELF_SERVICE_MODERATION_ACTIONS: readonly ModerationAction[] = [
  'submit',
  'resubmit',
  'withdraw',
];

export const moderationFieldDiff = z
  .record(
    z.string(),
    z.object({
      from: z.unknown(),
      to: z.unknown(),
    }),
  )
  .meta({ id: 'ModerationFieldDiff' });
export type ModerationFieldDiff = z.infer<typeof moderationFieldDiff>;

export const moderationHistoryItemSchema = z
  .object({
    id: z.uuid(),
    action: moderationAction,
    fromStatus: projectStatus,
    toStatus: projectStatus,
    actorLabel: z.literal('Tickif Review Team'),
    note: z.string().nullable(),
    reasonCode: z.string().nullable(),
    fieldDiff: moderationFieldDiff.nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'ModerationHistoryItem' });
export type ModerationHistoryItem = z.infer<typeof moderationHistoryItemSchema>;

export const moderationHistoryResponseSchema = z
  .object({
    items: z.array(moderationHistoryItemSchema),
  })
  .meta({ id: 'ModerationHistory' });
export type ModerationHistoryResponse = z.infer<typeof moderationHistoryResponseSchema>;

const taxonomySlug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a taxonomy slug such as modern or 3-bhk');

export const adminModerationQueueQuerySchema = z
  .object({
    status: z.enum(['submitted', 'in_review']).default('submitted'),
    sort: z.literal('oldest').default('oldest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'AdminModerationQueueQuery' });
export type AdminModerationQueueQuery = z.infer<typeof adminModerationQueueQuerySchema>;

export const adminModerationQueueItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    status: z.enum(['submitted', 'in_review']),
    designerName: z.string(),
    submittedAt: z.string().datetime().nullable(),
    reviewedBy: z.string().nullable(),
    imageCount: z.number().int().nonnegative(),
    completeness: projectCompletenessResponseSchema,
  })
  .meta({ id: 'AdminModerationQueueItem' });
export type AdminModerationQueueItem = z.infer<typeof adminModerationQueueItemSchema>;

export const adminModerationQueueResponseSchema = z
  .object({
    items: z.array(adminModerationQueueItemSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminModerationQueue' });
export type AdminModerationQueueResponse = z.infer<typeof adminModerationQueueResponseSchema>;

export const adminModerationImageSchema = z
  .object({
    id: z.uuid(),
    roomId: z.uuid().nullable(),
    originalUrl: z.url().nullable(),
    status: z.enum(['processing', 'ready', 'failed']),
    themeSlugs: z.array(z.string()),
    materialSlugs: z.array(z.string()),
    finishSlugs: z.array(z.string()),
    tagSlugs: z.array(z.string()),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    sortOrder: z.number().int(),
    duplicate: z
      .object({
        imageId: z.uuid(),
        distance: z.number().int().nonnegative(),
      })
      .nullable(),
  })
  .meta({ id: 'AdminModerationImage' });
export type AdminModerationImage = z.infer<typeof adminModerationImageSchema>;

export const adminModerationProjectSchema = z
  .object({
    id: z.uuid(),
    designerId: z.uuid(),
    designerName: z.string(),
    title: z.string(),
    slug: z.string(),
    status: projectStatus,
    description: z.string().nullable(),
    propertyTypeSlug: z.string().nullable(),
    propertySubtypeSlug: z.string().nullable(),
    scopeSlug: z.string().nullable(),
    bhkSlug: z.string().nullable(),
    sizeSqft: z.number().int().nullable(),
    citySlug: z.string().nullable(),
    localitySlug: z.string().nullable(),
    buildingName: z.string().nullable(),
    budgetBandSlug: z.string().nullable(),
    coverImageId: z.uuid().nullable(),
    completedMonth: z.string().nullable(),
    durationMonths: z.number().int().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    submittedAt: z.string().datetime().nullable(),
    publishedAt: z.string().datetime().nullable(),
    reviewedBy: z.string().nullable(),
    reviewStartedAt: z.string().datetime().nullable(),
    rejectionReasonCode: z.string().nullable(),
    moderationNote: z.string().nullable(),
    featuredAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'AdminModerationProject' });
export type AdminModerationProject = z.infer<typeof adminModerationProjectSchema>;

export const adminModerationDetailResponseSchema = z
  .object({
    project: adminModerationProjectSchema,
    rooms: z.array(projectRoomSchema),
    images: z.array(adminModerationImageSchema),
    completeness: projectCompletenessResponseSchema,
    history: z.array(moderationHistoryItemSchema),
    reviewComments: z.array(projectReviewCommentSchema),
  })
  .meta({ id: 'AdminModerationDetail' });
export type AdminModerationDetailResponse = z.infer<typeof adminModerationDetailResponseSchema>;

export const moderationNoteSchema = z
  .object({
    note: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'ModerationNote' });
export type ModerationNoteInput = z.infer<typeof moderationNoteSchema>;

export const rejectProjectSchema = moderationNoteSchema
  .extend({
    reasonCode: taxonomySlug,
  })
  .meta({ id: 'RejectProject' });
export type RejectProjectInput = z.infer<typeof rejectProjectSchema>;

export const adminCorrectProjectSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    propertyTypeSlug: taxonomySlug.nullable().optional(),
    propertySubtypeSlug: taxonomySlug.nullable().optional(),
    scopeSlug: taxonomySlug.nullable().optional(),
    bhkSlug: taxonomySlug.nullable().optional(),
    citySlug: taxonomySlug.nullable().optional(),
    localitySlug: taxonomySlug.nullable().optional(),
    budgetBandSlug: taxonomySlug.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    featuredAt: z.string().datetime().nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one correction field is required',
  })
  .meta({ id: 'AdminCorrectProject' });
export type AdminCorrectProjectInput = z.infer<typeof adminCorrectProjectSchema>;
