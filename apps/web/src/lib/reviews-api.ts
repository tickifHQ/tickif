import {
  ownReviewResponseSchema,
  organizationReviewsResponseSchema,
  publishedReviewsResponseSchema,
  reviewResponseSchema,
  type CreateReviewInput,
  type DisputeReviewInput,
  type OrganizationReviewsQuery,
  type UpdateReviewInput,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { handleApiResponse } from '@/lib/api-response';

export async function fetchTickifReviews(designerProfileId: string, page = 1) {
  const response = await api.api.reviews.$get(
    { query: { designerProfileId, page: String(page), limit: '10' } },
    { init: { cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    publishedReviewsResponseSchema,
    'Could not load Tickif reviews.',
  );
}
export async function fetchOwnReview(designerProfileId: string, cookie?: string) {
  const response = await api.api.reviews.mine.$get(
    { query: { designerProfileId } },
    { headers: cookie ? { cookie } : undefined, init: { cache: 'no-store' } },
  );
  return handleApiResponse(response, ownReviewResponseSchema, 'Could not load your review.');
}
export async function submitReview(input: CreateReviewInput) {
  return handleApiResponse(
    await api.api.reviews.$post({ json: input }),
    reviewResponseSchema,
    'Could not submit your review.',
  );
}
export async function editReview(id: string, expectedRevision: number, input: UpdateReviewInput) {
  return handleApiResponse(
    await api.api.reviews[':id'].$patch({
      param: { id },
      query: { expectedRevision: String(expectedRevision) },
      json: input,
    }),
    reviewResponseSchema,
    'Could not update your review.',
  );
}
export async function fetchOrganizationReviews(query: OrganizationReviewsQuery, cookie?: string) {
  const response = await api.api.reviews.organization.$get(
    {
      query: {
        designerProfileId: query.designerProfileId,
        page: String(query.page),
        limit: String(query.limit),
        status: query.status,
      },
    },
    { headers: cookie ? { cookie } : undefined, init: { cache: 'no-store' } },
  );
  return handleApiResponse(
    response,
    organizationReviewsResponseSchema,
    'Could not load studio reviews.',
  );
}
export async function disputeReview(
  id: string,
  expectedRevision: number,
  input: DisputeReviewInput,
) {
  return handleApiResponse(
    await api.api.reviews[':id'].dispute.$post({
      param: { id },
      query: { expectedRevision: String(expectedRevision) },
      json: input,
    }),
    reviewResponseSchema,
    'Could not dispute this review.',
  );
}
