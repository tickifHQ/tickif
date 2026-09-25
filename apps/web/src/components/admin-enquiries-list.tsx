import Link from 'next/link';
import type { AdminEnquiriesQuery, AdminEnquiriesResponse } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { Card, CardContent, CardHeader } from '@repo/ui/components/card';
import { EmptyState } from '@repo/ui/components/empty-state';
import { cn } from '@repo/ui/lib/utils';
import { CalendarClock, CircleDollarSign, Inbox, UserRound } from 'lucide-react';
import { AdminEnquiriesLoadError } from '@/components/admin-enquiries-load-error';
import { UrlListPagination } from '@/components/list-pagination';

type EnquiryStatus = NonNullable<AdminEnquiriesQuery['status']>;
type StatusFilter = EnquiryStatus | 'all';

const filters: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'responded', label: 'Responded' },
  { value: 'closed', label: 'Closed' },
];

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function statusLabel(status: EnquiryStatus) {
  if (status === 'responded') return 'Responded';
  if (status === 'closed') return 'Closed';
  return 'Open';
}

function statusVariant(status: EnquiryStatus) {
  if (status === 'responded') return 'success' as const;
  if (status === 'closed') return 'secondary' as const;
  return 'info' as const;
}

function filterHref(status: StatusFilter, limit: number) {
  const params = new URLSearchParams({ page: '1', limit: String(limit) });
  if (status !== 'all') params.set('status', status);
  return `/admin/enquiries?${params.toString()}`;
}

export function AdminEnquiriesList({
  result,
  query,
  error,
}: {
  result: AdminEnquiriesResponse;
  query: AdminEnquiriesQuery;
  error?: string;
}) {
  const activeFilter = query.status ?? 'all';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">
          Platform activity
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Enquiries
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Review the enquiries sent across Tickif. This view is read-only.
        </p>
      </header>

      <nav aria-label="Filter enquiries by status" className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter.value === activeFilter;
          return (
            <Link
              key={filter.value}
              href={filterHref(filter.value, query.limit)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {error ? (
        <AdminEnquiriesLoadError message={error} />
      ) : result.items.length === 0 ? (
        <Card>
          <CardContent className="py-14">
            <EmptyState
              icon={<Inbox className="size-5" aria-hidden="true" />}
              title={query.status ? `No ${query.status} enquiries` : 'No enquiries yet'}
              description="Enquiries matching this status will appear here automatically."
            />
          </CardContent>
        </Card>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {result.items.map((enquiry) => (
            <li key={enquiry.id}>
              <Card className="h-full overflow-hidden">
                <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border/70 p-5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Subject
                    </p>
                    <h2 className="mt-1 break-words font-display text-lg font-semibold leading-6">
                      {enquiry.subject}
                    </h2>
                  </div>
                  <Badge variant={statusVariant(enquiry.status)}>
                    {statusLabel(enquiry.status)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  <section className="grid gap-4 sm:grid-cols-2" aria-label="Participants">
                    <div className="flex min-w-0 gap-3">
                      <UserRound
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Requester</p>
                        <p className="mt-1 truncate text-sm font-medium">
                          {enquiry.requester.name}
                        </p>
                        <a
                          href={`mailto:${enquiry.requester.email}`}
                          className="block truncate text-sm text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {enquiry.requester.email}
                        </a>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Designer</p>
                      <p className="mt-1 truncate text-sm font-medium">
                        {enquiry.designer.displayName}
                      </p>
                    </div>
                  </section>

                  <dl className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
                    <div>
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <CircleDollarSign className="size-3.5" aria-hidden="true" /> Budget
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{enquiry.budget}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <CalendarClock className="size-3.5" aria-hidden="true" /> Timeline
                      </dt>
                      <dd className="mt-1 text-sm font-medium">
                        {enquiry.timeline ?? 'Not specified'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Referred project
                      </dt>
                      <dd className="mt-1 break-words text-sm font-medium">
                        {enquiry.referredProject?.title ?? 'No referred project'}
                      </dd>
                    </div>
                  </dl>

                  <div className="grid gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground sm:grid-cols-2">
                    <p>
                      <span className="font-medium text-foreground">Created:</span>{' '}
                      <time dateTime={enquiry.createdAt}>{formatDate(enquiry.createdAt)}</time>
                    </p>
                    <p className="sm:text-right">
                      <span className="font-medium text-foreground">Updated:</span>{' '}
                      <time dateTime={enquiry.updatedAt}>{formatDate(enquiry.updatedAt)}</time>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {!error && result.total > 0 ? (
        <UrlListPagination
          page={result.page}
          totalPages={result.totalPages}
          limit={result.limit}
          total={result.total}
          itemName="enquiry"
          itemNamePlural="enquiries"
          pageSizes={[10, 25, 50, 100]}
        />
      ) : null}
    </div>
  );
}
