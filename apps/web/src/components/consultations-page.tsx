import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  listBookingsQuerySchema,
  bookingStatusSchema,
  type ListBookingsQuery,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { ConsultationList } from '@/components/consultation-list';
import { PublicHeader } from '@/components/public-header';
import { getServerSession, activeContextForSession } from '@/lib/auth-guard';
import { getCurrentOrgRole } from '@/lib/current-org-role';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import { fetchConsultations } from '@/lib/bookings-api';

export async function ConsultationsPage({
  scope,
  searchParams,
}: {
  scope: 'mine' | 'inbox';
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [session, params, requestHeaders] = await Promise.all([
    getServerSession(),
    searchParams,
    headers(),
  ]);
  if (!session) redirect('/login');
  const personal = scope === 'mine';
  if (personal && activeContextForSession(session).kind === 'organization')
    redirect('/designer/consultations');
  if (session.user.role !== 'visitor' && session.user.role !== 'designer') redirect('/dashboard');
  const [profile, role] = personal
    ? [null, null]
    : await Promise.all([requireCurrentDesignerProfile(), getCurrentOrgRole()]);
  const parsed = listBookingsQuerySchema.safeParse({ ...params, limit: 12 });
  const query: ListBookingsQuery = parsed.success
    ? parsed.data
    : { status: 'all', page: 1, limit: 12 };
  const data = await fetchConsultations(query, scope, requestHeaders.get('cookie') ?? '');
  const base = personal ? '/home/consultations' : '/designer/consultations';
  const href = (page: number, status = query.status) =>
    `${base}?${new URLSearchParams({ status, page: String(page) })}`;
  if (data.page > 1 && data.page > data.totalPages) redirect(href(Math.max(1, data.totalPages)));
  return (
    <>
      {personal ? <PublicHeader isAuthenticated userRole={session.user.role ?? null} /> : null}
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-8">
        <header className="flex flex-col gap-2">
          {personal ? (
            <Link className="text-sm text-muted-foreground underline" href="/home">
              My Tickif
            </Link>
          ) : null}
          <h1 className="font-display text-2xl font-medium">
            {personal ? 'My consultations' : 'Consultations'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {personal
              ? 'Track your requests, confirmed times and completed consultations.'
              : `Consultation requests for ${profile?.displayName ?? 'your active branch'}. Owners and admins can manage appointments.`}{' '}
            All times are in IST.
          </p>
        </header>
        <nav aria-label="Consultation status" className="flex flex-wrap gap-2">
          {(['all', ...bookingStatusSchema.options] as const).map((status) => (
            <Button key={status} asChild variant={query.status === status ? 'default' : 'outline'}>
              <Link href={href(1, status)}>{status === 'all' ? 'All consultations' : status}</Link>
            </Button>
          ))}
        </nav>
        <p className="text-sm text-muted-foreground">
          {data.total} consultations · Page {data.page} of {Math.max(1, data.totalPages)}
        </p>
        <ConsultationList
          data={data}
          scope={scope}
          canWrite={personal || role === 'owner' || role === 'admin'}
        />
        <nav aria-label="Consultation pages" className="flex gap-3">
          {data.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={href(data.page - 1)}>Previous consultations</Link>
            </Button>
          ) : null}
          {data.page < data.totalPages ? (
            <Button asChild variant="outline">
              <Link href={href(data.page + 1)}>Next consultations</Link>
            </Button>
          ) : null}
        </nav>
      </main>
    </>
  );
}
