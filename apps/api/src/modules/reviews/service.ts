import type {
  AdminReviewsQuery,
  AdminReviewsResponse,
  CreateReviewInput,
  DisputeReviewInput,
  ListPublishedReviewsQuery,
  PublishedReviewsResponse,
  RejectReviewInput,
  ResolveReviewDisputeInput,
  ReviewModerationAction,
  ReviewResponse,
  ReviewStatus,
  UpdateReviewInput,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  reviewsRepository,
  type ReviewViewRecord,
  type TransitionReviewParams,
} from './repository.js';

const PUBLISHED_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ReviewCaller = {
  userId: string;
  phoneNumberVerified: boolean;
  activeOrgId: string | null;
};

export type AdminReviewCaller = {
  userId: string;
};

function toResponse(row: ReviewViewRecord): ReviewResponse {
  return {
    id: row.id,
    designerProfileId: row.designerProfileId,
    author: {
      id: row.authorUserId,
      name: row.authorName,
      avatarUrl: row.authorImage,
    },
    project:
      row.projectId && row.projectTitle && row.projectSlug
        ? {
            id: row.projectId,
            title: row.projectTitle,
            slug: row.projectSlug,
          }
        : null,
    bookingId: row.bookingId,
    verifiedConsultation: row.bookingId !== null,
    rating: row.rating,
    body: row.body,
    status: row.status,
    moderationRevision: row.moderationRevision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    disputedAt: row.disputedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function reviewTransitionError(): AppError {
  return AppError.invalidTransition('Review status changed or transition is not allowed');
}

async function transitionOrConflict(params: TransitionReviewParams): Promise<ReviewResponse> {
  const result = await reviewsRepository.transition(params);
  if (result.kind === 'conflict') throw reviewTransitionError();
  if (result.kind === 'forbidden') {
    throw AppError.forbidden('Organization write access required');
  }
  return toResponse(result.review);
}

function transitionParams(
  review: ReviewViewRecord,
  caller: AdminReviewCaller,
  toStatus: ReviewStatus,
  action: ReviewModerationAction,
  options: { note?: string | null; reasonCode?: string | null } = {},
): TransitionReviewParams {
  return {
    id: review.id,
    designerProfileId: review.designerProfileId,
    fromStatus: review.status,
    toStatus,
    expectedRevision: review.moderationRevision,
    actorUserId: caller.userId,
    action,
    ...options,
  };
}

export const reviewsService = {
  async create(input: CreateReviewInput, caller: ReviewCaller): Promise<ReviewResponse> {
    if (!caller.phoneNumberVerified) {
      throw AppError.unprocessable('A verified phone number is required to submit a review');
    }

    const result = await reviewsRepository.create({
      ...input,
      authorUserId: caller.userId,
    });

    switch (result.kind) {
      case 'designer_not_found':
        throw AppError.notFound('Designer profile not found');
      case 'phone_unverified':
        throw AppError.unprocessable('A verified phone number is required to submit a review');
      case 'self_review':
        throw AppError.forbidden('Members cannot review their own designer organization');
      case 'invalid_project':
        throw AppError.unprocessable('projectId must be a published project by this designer');
      case 'invalid_booking':
        throw AppError.unprocessable(
          'bookingId must be a completed consultation requested by the reviewer',
        );
      case 'duplicate':
        throw AppError.conflict('You have already reviewed this designer');
      case 'created':
        return toResponse(result.review);
    }
  },

  async update(
    id: string,
    input: UpdateReviewInput,
    caller: ReviewCaller,
  ): Promise<ReviewResponse> {
    if (!caller.phoneNumberVerified) {
      throw AppError.unprocessable('A verified phone number is required to edit a review');
    }
    const review = await reviewsRepository.findById(id);
    if (!review || review.authorUserId !== caller.userId) {
      throw AppError.notFound('Review not found');
    }
    if (review.status !== 'pending' && review.status !== 'published') {
      throw reviewTransitionError();
    }
    if (
      review.status === 'published' &&
      (!review.publishedAt ||
        Date.now() - review.publishedAt.getTime() > PUBLISHED_EDIT_WINDOW_MS)
    ) {
      throw AppError.conflict('Published reviews can only be edited within 24 hours');
    }

    const updated = await reviewsRepository.update({
      id,
      authorUserId: caller.userId,
      designerProfileId: review.designerProfileId,
      fromStatus: review.status,
      expectedRevision: review.moderationRevision,
      publishedEditCutoff: new Date(Date.now() - PUBLISHED_EDIT_WINDOW_MS),
      ...input,
    });
    if (updated.kind === 'phone_unverified') {
      throw AppError.unprocessable('A verified phone number is required to edit a review');
    }
    if (updated.kind === 'self_review') {
      throw AppError.forbidden('Members cannot review their own designer organization');
    }
    if (updated.kind === 'conflict') throw reviewTransitionError();
    return toResponse(updated.review);
  },

  async listPublished(query: ListPublishedReviewsQuery): Promise<PublishedReviewsResponse> {
    const { items, aggregate } = await reviewsRepository.listPublished(query);
    return {
      items: items.map(toResponse),
      histogram: aggregate.histogram,
      averageRating: aggregate.averageRating,
      reviewCount: aggregate.reviewCount,
      page: query.page,
      limit: query.limit,
      totalPages:
        aggregate.reviewCount === 0 ? 0 : Math.ceil(aggregate.reviewCount / query.limit),
    };
  },

  async dispute(
    id: string,
    input: DisputeReviewInput,
    caller: ReviewCaller,
  ): Promise<ReviewResponse> {
    const review = await reviewsRepository.findById(id);
    if (!review || !caller.activeOrgId || review.designerOrgId !== caller.activeOrgId) {
      throw AppError.notFound('Review not found');
    }
    if (review.status !== 'published') throw reviewTransitionError();

    return transitionOrConflict({
      id: review.id,
      designerProfileId: review.designerProfileId,
      fromStatus: 'published',
      toStatus: 'disputed',
      expectedRevision: review.moderationRevision,
      actorUserId: caller.userId,
      action: 'dispute',
      note: input.note,
      requiredWriter: {
        organizationId: caller.activeOrgId,
        userId: caller.userId,
      },
    });
  },

  async listAdmin(query: AdminReviewsQuery): Promise<AdminReviewsResponse> {
    const { items, total } = await reviewsRepository.listAdmin(query);
    return {
      items: items.map(toResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  async publish(id: string, caller: AdminReviewCaller): Promise<ReviewResponse> {
    const review = await reviewsRepository.findById(id);
    if (!review) throw AppError.notFound('Review not found');
    if (review.status !== 'pending') throw reviewTransitionError();
    return transitionOrConflict(
      transitionParams(review, caller, 'published', 'publish'),
    );
  },

  async reject(
    id: string,
    input: RejectReviewInput,
    caller: AdminReviewCaller,
  ): Promise<ReviewResponse> {
    const review = await reviewsRepository.findById(id);
    if (!review) throw AppError.notFound('Review not found');
    if (review.status !== 'pending') throw reviewTransitionError();
    return transitionOrConflict(
      transitionParams(review, caller, 'rejected', 'reject', {
        note: input.note,
        reasonCode: input.reasonCode,
      }),
    );
  },

  async resolveDispute(
    id: string,
    input: ResolveReviewDisputeInput,
    caller: AdminReviewCaller,
  ): Promise<ReviewResponse> {
    const review = await reviewsRepository.findById(id);
    if (!review) throw AppError.notFound('Review not found');
    if (review.status !== 'disputed') throw reviewTransitionError();

    const publish = input.decision === 'publish';
    return transitionOrConflict(
      transitionParams(
        review,
        caller,
        publish ? 'published' : 'removed',
        publish ? 'resolve_publish' : 'remove',
        { note: input.note },
      ),
    );
  },
};
