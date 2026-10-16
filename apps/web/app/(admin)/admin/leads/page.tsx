import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminLeadQuerySchema, adminReportWindow } from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import {
  adminQueryValues,
  adminVisibilityHref,
  fetchAdminCompanyOptions,
  fetchAdminLeadList,
} from '@/lib/admin-visibility-api';
import { AdminVisibilityFilters } from '@/components/admin-visibility-filters';
import { AdminVisibilityErrorState } from '@/components/admin-visibility-error';
import { AdminLeadsWorkspace } from '@/components/admin-leads-workspace';

export const metadata = { title: 'Platform leads · Tickif' };
export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth({ requiredRole: 'admin' });
  const parsed = adminLeadQuerySchema.safeParse(adminQueryValues(await searchParams));
  if (!parsed.success)
    return (
      <div className="p-6">
        <AdminVisibilityErrorState
          resetHref="/admin/leads"
          message="Invalid filters. Choose both dates in order, within 366 days, and a valid lead stage and page."
        />
      </div>
    );
  const query = { ...parsed.data, ...adminReportWindow(parsed.data) };
  const cookie = (await headers()).get('cookie');
  if (!cookie)
    return (
      <div className="p-6">
        <AdminVisibilityErrorState message="Your session could not be read. Sign in again." />
      </div>
    );
  const [data, company] = await Promise.allSettled([
    fetchAdminLeadList(query, cookie),
    query.organizationId
      ? fetchAdminCompanyOptions({ id: query.organizationId, page: 1, limit: 1 }, cookie)
      : Promise.resolve(null),
  ]);
  if (data.status === 'fulfilled' && query.page > Math.max(1, data.value.totalPages))
    redirect(
      adminVisibilityHref('/admin/leads', query, { page: Math.max(1, data.value.totalPages) }),
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-primary">Platform visibility</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Leads and pipeline</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Inspect lead details, assignment and studio responses across companies. This workspace is
          read-only.
        </p>
      </header>
      <AdminVisibilityFilters
        action="/admin/leads"
        query={query}
        companyName={company.status === 'fulfilled' ? company.value?.items[0]?.name : undefined}
        leads
      />
      {data.status === 'fulfilled' ? (
        <AdminLeadsWorkspace result={data.value} query={query} />
      ) : (
        <AdminVisibilityErrorState
          message={data.reason instanceof Error ? data.reason.message : 'Could not load leads.'}
        />
      )}
    </div>
  );
}
