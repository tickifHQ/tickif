import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { adminLeadIdSchema, adminLeadQuerySchema, adminThreadQuerySchema } from '@repo/contracts';
import { requireAuth } from '@/lib/auth-guard';
import {
  AdminVisibilityError,
  adminQueryValues,
  adminVisibilityHref,
  fetchAdminLeadDetail,
} from '@/lib/admin-visibility-api';
import { AdminLeadRecord } from '@/components/admin-leads-workspace';
import { AdminVisibilityErrorState } from '@/components/admin-visibility-error';

export const metadata = { title: 'Lead details · Tickif' };
export default async function AdminLeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth({ requiredRole: 'admin' });
  const id = adminLeadIdSchema.safeParse(await params);
  if (!id.success) notFound();
  const raw = adminQueryValues(await searchParams);
  const parsed = adminThreadQuerySchema.safeParse(raw);
  const scope = adminLeadQuerySchema.safeParse(raw);
  if (!parsed.success || !scope.success)
    return (
      <div className="p-6">
        <AdminVisibilityErrorState message="Invalid detail or reporting filters." />
      </div>
    );
  const cookie = (await headers()).get('cookie');
  if (!cookie)
    return (
      <div className="p-6">
        <AdminVisibilityErrorState message="Your session could not be read. Sign in again." />
      </div>
    );
  const result = await fetchAdminLeadDetail(id.data.id, parsed.data, cookie)
    .then((data) => ({ data, error: null }))
    .catch((error: unknown) => ({ data: null, error }));
  if (result.error instanceof AdminVisibilityError && result.error.status === 404) notFound();
  if (result.data && parsed.data.page > Math.max(1, result.data.messages.totalPages))
    redirect(
      adminVisibilityHref(`/admin/leads/${id.data.id}`, scope.data, {
        page: Math.max(1, result.data.messages.totalPages),
        limit: parsed.data.limit,
      }),
    );
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        className="text-sm text-primary hover:underline"
        href={adminVisibilityHref('/admin/leads', scope.data, { page: 1 })}
      >
        ← Back to filtered leads
      </Link>
      {result.data ? (
        <AdminLeadRecord lead={result.data} />
      ) : (
        <AdminVisibilityErrorState
          message={
            result.error instanceof Error ? result.error.message : 'Could not load this lead.'
          }
        />
      )}
    </div>
  );
}
