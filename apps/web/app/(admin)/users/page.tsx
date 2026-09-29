import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  adminUsersQuerySchema,
  type AdminUsersQuery,
  type AdminUsersResponse,
} from '@repo/contracts';
import { AdminUsersDirectory } from '@/components/admin-users-directory';
import { AdminUsersFilters } from '@/components/admin-users-filters';
import { fetchAdminUsers } from '@/lib/admin-activity-api';
import { requireAuth } from '@/lib/auth-guard';

export const metadata = {
  title: 'User activity · Tickif',
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(params: RawSearchParams): AdminUsersQuery {
  const rawPage = first(params.page);
  const rawLimit = first(params.limit);
  const rawSearch = first(params.q)?.trim();
  const rawRole = first(params.role);
  const rawStatus = first(params.status);
  const page = adminUsersQuerySchema.shape.page.safeParse(rawPage);
  const limit = adminUsersQuerySchema.shape.limit.safeParse(rawLimit);
  const search = adminUsersQuerySchema.shape.q.safeParse(rawSearch || undefined);
  const role = adminUsersQuerySchema.shape.role.safeParse(rawRole);
  const status = adminUsersQuerySchema.shape.status.safeParse(rawStatus);

  return {
    page: page.success ? page.data : 1,
    limit: limit.success ? limit.data : 25,
    ...(search.success && search.data ? { q: search.data } : {}),
    ...(role.success && role.data ? { role: role.data } : {}),
    ...(status.success && status.data ? { status: status.data } : {}),
  };
}

function usersHref(query: AdminUsersQuery, page: number): string {
  const params = new URLSearchParams({ page: String(page), limit: String(query.limit) });
  if (query.q) params.set('q', query.q);
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  return `/users?${params.toString()}`;
}

function emptyResponse(query: AdminUsersQuery): AdminUsersResponse {
  return {
    items: [],
    page: query.page,
    limit: query.limit,
    total: 0,
    totalPages: 0,
  };
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams>;
} = {}) {
  await requireAuth({ requiredRole: 'admin' });
  const query = parseQuery((await searchParams) ?? {});
  const cookie = (await headers()).get('cookie');
  let users = emptyResponse(query);
  let error: string | undefined;

  if (!cookie) {
    error = 'Your admin session could not be found. Please sign in again.';
  } else {
    try {
      users = await fetchAdminUsers(query, { headers: { cookie } });
    } catch {
      error = 'Could not load the user directory. Try refreshing the page.';
    }
  }

  const lastPage = Math.max(1, users.totalPages);
  if (!error && query.page > lastPage) redirect(usersHref(query, lastPage));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
            Tickif operations
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            User activity
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Find platform accounts, review activity totals, and inspect their recent recorded search
            and viewing history.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm">
          <span className="text-muted-foreground">Matching users</span>
          <span className="font-semibold text-foreground">
            {error ? 'Unavailable' : users.total}
          </span>
        </div>
      </div>

      <AdminUsersFilters
        key={`${query.q ?? ''}:${query.role ?? ''}:${query.status ?? ''}`}
        query={{ q: query.q, role: query.role, status: query.status }}
      />
      <div className="mt-5">
        <AdminUsersDirectory users={users} error={error} />
      </div>
    </div>
  );
}
