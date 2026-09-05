import { z } from 'zod';

export const reviewStatusSchema = z
  .enum(['pending', 'published', 'rejected', 'disputed', 'removed'])
  .meta({ id: 'ReviewStatus' });
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewModerationActionSchema = z
  .enum(['submit', 'edit', 'publish', 'reject', 'dispute', 'resolve_publish', 'remove'])
  .meta({ id: 'ReviewModerationAction' });
export type ReviewModerationAction = z.infer<typeof reviewModerationActionSchema>;

export const reviewIdParamSchema = z
  .object({
    id: z.uuid(),
  })
  .meta({ id: 'ReviewIdParam' });

const reviewBodySchema = z.string().trim().min(30).max(2000).nullable();

export const createReviewSchema = z
  .object({
    designerProfileId: z.uuid(),
    projectId: z.uuid().nullable().optional(),
    bookingId: z.uuid().nullable().optional(),
    rating: z.number().int().min(1).max(5),
    body: reviewBodySchema.optional(),
  })
  .meta({ id: 'CreateReview' });
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    body: reviewBodySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one review field is required',
  })
  .meta({ id: 'UpdateReview' });
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const disputeReviewSchema = z
  .object({
    note: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'DisputeReview' });
export type DisputeReviewInput = z.infer<typeof disputeReviewSchema>;

export const rejectReviewSchema = z
  .object({
    note: z.string().trim().min(1).max(2000),
    reasonCode: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a URL-safe reason code'),
  })
  .meta({ id: 'RejectReview' });
export type RejectReviewInput = z.infer<typeof rejectReviewSchema>;

export const resolveReviewDisputeSchema = z
  .object({
    decision: z.enum(['publish', 'remove']),
    note: z.string().trim().min(1).max(2000),
  })
  .meta({ id: 'ResolveReviewDispute' });
export type ResolveReviewDisputeInput = z.infer<typeof resolveReviewDisputeSchema>;

export const reviewResponseSchema = z
  .object({
    id: z.uuid(),
    designerProfileId: z.uuid(),
    author: z.object({
      id: z.string(),
      name: z.string(),
      avatarUrl: z.string().url().nullable(),
    }),
    project: z
      .object({
        id: z.uuid(),
        title: z.string(),
        slug: z.string(),
      })
      .nullable(),
    bookingId: z.uuid().nullable(),
    verifiedConsultation: z.boolean(),
    rating: z.number().int().min(1).max(5),
    body: z.string().nullable(),
    status: reviewStatusSchema,
    moderationRevision: z.number().int().nonnegative(),
    publishedAt: z.string().datetime().nullable(),
    disputedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'Review' });
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;

export const listPublishedReviewsQuerySchema = z
  .object({
    designerProfileId: z.uuid(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'ListPublishedReviewsQuery' });
export type ListPublishedReviewsQuery = z.infer<typeof listPublishedReviewsQuerySchema>;

export const reviewHistogramSchema = z
  .object({
    1: z.number().int().nonnegative(),
    2: z.number().int().nonnegative(),
    3: z.number().int().nonnegative(),
    4: z.number().int().nonnegative(),
    5: z.number().int().nonnegative(),
  })
  .meta({ id: 'ReviewHistogram' });
export type ReviewHistogram = z.infer<typeof reviewHistogramSchema>;

export const publishedReviewsResponseSchema = z
  .object({
    items: z.array(reviewResponseSchema),
    histogram: reviewHistogramSchema,
    averageRating: z.number().min(0).max(5),
    reviewCount: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'PublishedReviews' });
export type PublishedReviewsResponse = z.infer<typeof publishedReviewsResponseSchema>;

export const adminReviewsQuerySchema = z
  .object({
    status: reviewStatusSchema.default('pending'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'AdminReviewsQuery' });
export type AdminReviewsQuery = z.infer<typeof adminReviewsQuerySchema>;

export const adminReviewsResponseSchema = z
  .object({
    items: z.array(reviewResponseSchema),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminReviews' });
export type AdminReviewsResponse = z.infer<typeof adminReviewsResponseSchema>;

/** Required on admin decisions: never moderate content newer than the viewed revision. */
export const adminReviewDecisionQuerySchema = z
  .object({
    expectedRevision: z.coerce
      .string()
      .trim()
      .regex(/^\d+$/, 'Expected revision must be a nonnegative integer')
      .transform(Number)
      .pipe(z.number().int().nonnegative()),
  })
  .meta({ id: 'AdminReviewDecisionQuery' });

/** Private read model. Do not return moderation notes from public review endpoints. */
export const adminReviewDetailResponseSchema = z
  .object({
    review: reviewResponseSchema,
    designer: z.object({ id: z.uuid(), name: z.string() }),
    history: z.array(
      z.object({
        id: z.uuid(),
        actorUserId: z.string().nullable(),
        action: reviewModerationActionSchema,
        fromStatus: reviewStatusSchema.nullable(),
        toStatus: reviewStatusSchema,
        note: z.string().nullable(),
        reasonCode: z.string().nullable(),
        createdAt: z.string().datetime(),
      }),
    ),
  })
  .meta({ id: 'AdminReviewDetail' });
export type AdminReviewDetailResponse = z.infer<typeof adminReviewDetailResponseSchema>;
