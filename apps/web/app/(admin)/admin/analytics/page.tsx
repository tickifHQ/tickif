import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminEntityQuerySchema, adminReportWindow } from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import {
  adminQueryValues,
  adminVisibilityHref,
  fetchAdminCompanyOptions,
  fetchAdminEntities,
  fetchAdminReport,
} from '@/lib/admin-visibility-api';
import { AdminVisibilityFilters } from '@/components/admin-visibility-filters';
import { AdminVisibilityErrorState } from '@/components/admin-visibility-error';
import { AdminAnalyticsWorkspace } from '@/components/admin-analytics-workspace';

export const metadata = { title: 'Company and designer analytics · Tickif' };
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth({ requiredRole: 'admin' });
  const parsed = adminEntityQuerySchema.safeParse(adminQueryValues(await searchParams));
  if (!parsed.success)
    return (
      <div className="p-6">
        <AdminVisibilityErrorState
          resetHref="/admin/analytics"
          message="Invalid filters. Choose both dates in order, within 366 days, and a valid page."
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
  const [report, entities, company] = await Promise.allSettled([
    fetchAdminReport(query, cookie),
    fetchAdminEntities(query, cookie),
    query.organizationId
      ? fetchAdminCompanyOptions({ id: query.organizationId, page: 1, limit: 1 }, cookie)
      : Promise.resolve(null),
  ]);
  if (entities.status === 'fulfilled' && query.page > Math.max(1, entities.value.totalPages))
    redirect(
      adminVisibilityHref('/admin/analytics', query, {
        page: Math.max(1, entities.value.totalPages),
      }),
    );
  const error =
    report.status === 'rejected'
      ? report.reason
      : entities.status === 'rejected'
        ? entities.reason
        : null;
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-primary">Platform visibility</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Company and designer analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare performance and drill into company, designer and enquiry cohorts.
        </p>
      </header>
      <AdminVisibilityFilters
        action="/admin/analytics"
        query={query}
        groupBy={query.groupBy}
        companyName={company.status === 'fulfilled' ? company.value?.items[0]?.name : undefined}
      />
      {report.status === 'fulfilled' && entities.status === 'fulfilled' ? (
        <AdminAnalyticsWorkspace report={report.value} entities={entities.value} query={query} />
      ) : (
        <AdminVisibilityErrorState
          message={error instanceof Error ? error.message : 'Could not load reporting data.'}
        />
      )}
    </div>
  );
}
