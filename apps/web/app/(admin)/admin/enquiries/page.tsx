import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AdminEnquiriesQuery, AdminEnquiriesResponse } from '@repo/contracts';
import { adminEnquiriesQuerySchema } from '@repo/contracts';
import { AdminEnquiriesList } from '@/components/admin-enquiries-list';
import { requireAuth } from '@/lib/auth-guard';
import { AdminEnquiriesApiError, fetchAdminEnquiries } from '@/lib/admin-enquiries-api';

export const metadata = {
  title: 'Admin enquiries · Tickif',
};

const emptyResult: AdminEnquiriesResponse = {
  items: [],
  page: 1,
  limit: 25,
  total: 0,
  totalPages: 0,
};

function canonicalHref(query: AdminEnquiriesQuery) {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.status) params.set('status', query.status);
  return `/admin/enquiries?${params.toString()}`;
}

function normalizeQuery(params: Record<string, string | string[] | undefined>) {
  const status = adminEnquiriesQuerySchema.shape.status.safeParse(params.status);
  const page = adminEnquiriesQuerySchema.shape.page.safeParse(params.page);
  const limit = adminEnquiriesQuerySchema.shape.limit.safeParse(params.limit);
  const query: AdminEnquiriesQuery = {
    page: page.success ? page.data : 1,
    limit: limit.success ? limit.data : 25,
    ...(status.success && status.data ? { status: status.data } : {}),
  };
  return { query, invalid: !status.success || !page.success || !limit.success };
}

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  await requireAuth({ requiredRole: 'admin' });
  const { query, invalid } = normalizeQuery((await searchParams) ?? {});
  const cookie = (await headers()).get('cookie');

  let result = { ...emptyResult, page: query.page, limit: query.limit };
  let error: string | undefined;
  if (!cookie) {
    error = 'Your admin session could not be found. Please sign in again.';
  } else {
    try {
      result = await fetchAdminEnquiries(query, { headers: { cookie } });
    } catch (cause) {
      error =
        cause instanceof AdminEnquiriesApiError && cause.status === 403
          ? 'Your account does not have permission to view platform enquiries.'
          : 'Refresh the page to try loading the latest enquiries again.';
    }
  }

  const lastPage = Math.max(1, result.totalPages);
  if (!error && (invalid || query.page > lastPage)) {
    redirect(canonicalHref({ ...query, page: Math.min(query.page, lastPage) }));
  }

  return <AdminEnquiriesList result={result} query={query} error={error} />;
}
