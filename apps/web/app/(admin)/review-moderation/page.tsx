import { headers } from 'next/headers';
import { adminReviewsQuerySchema, type AdminReviewsResponse } from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import { fetchAdminReviews } from '@/lib/admin-review-api';
import { AdminReviewQueue } from '@/components/admin-review-queue';

export const metadata = { title: 'Review moderation · Tickif' };

export default async function ReviewModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth({ requiredRole: 'admin' });
  const params = await searchParams;
  const parsed = adminReviewsQuerySchema.safeParse({ status: params.status, page: params.page });
  const query =
    parsed.success && (parsed.data.status === 'pending' || parsed.data.status === 'disputed')
      ? { ...parsed.data, status: parsed.data.status }
      : { status: 'pending' as const, page: 1, limit: 20 };
  let queue: AdminReviewsResponse = {
    items: [],
    page: query.page,
    limit: query.limit,
    total: 0,
    totalPages: 0,
  };
  let error: string | undefined;
  const cookie = (await headers()).get('cookie');
  try {
    if (!cookie) throw new Error('Your admin session could not be found. Sign in again.');
    queue = await fetchAdminReviews(query, cookie);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : 'Could not load reviews.';
  }
  return (
    <AdminReviewQueue
      key={`${query.status}:${query.page}`}
      initialQueue={queue}
      status={query.status}
      initialError={error}
    />
  );
}
