import {
  adminReviewDetailResponseSchema,
  adminReviewsResponseSchema,
  type AdminReviewsQuery,
  type RejectReviewInput,
  type ResolveReviewDisputeInput,
} from '@repo/contracts';
import { api } from '@/lib/api';

async function check(response: Response) {
  if (response.status === 409)
    throw new Error('This review changed. Refresh the details before deciding again.');
  if (response.status === 401 || response.status === 403)
    throw new Error('Your admin access has expired. Sign in again.');
  if (!response.ok) throw new Error('Could not complete this request. Please try again.');
}

export async function fetchAdminReviews(query: AdminReviewsQuery, cookie?: string) {
  const response = await api.api.admin.reviews.$get(
    {
      query: {
        status: query.status,
        page: String(query.page),
        limit: String(query.limit),
      },
    },
    cookie ? { headers: { cookie }, cache: 'no-store' } : undefined,
  );
  await check(response);
  const parsed = adminReviewsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The review queue response was invalid.');
  return parsed.data;
}

export async function fetchAdminReview(id: string) {
  const response = await api.api.admin.reviews[':id'].$get({ param: { id } });
  await check(response);
  const parsed = adminReviewDetailResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The review detail response was invalid.');
  return parsed.data;
}

export async function publishAdminReview(id: string, revision: number) {
  await check(
    await api.api.admin.reviews[':id'].publish.$post({
      param: { id },
      query: { expectedRevision: String(revision) },
    }),
  );
}

export async function rejectAdminReview(id: string, revision: number, input: RejectReviewInput) {
  await check(
    await api.api.admin.reviews[':id'].reject.$post({
      param: { id },
      query: { expectedRevision: String(revision) },
      json: input,
    }),
  );
}

export async function resolveAdminReview(
  id: string,
  revision: number,
  input: ResolveReviewDisputeInput,
) {
  await check(
    await api.api.admin.reviews[':id']['resolve-dispute'].$post({
      param: { id },
      query: { expectedRevision: String(revision) },
      json: input,
    }),
  );
}
