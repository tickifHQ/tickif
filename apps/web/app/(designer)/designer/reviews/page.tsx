import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  organizationReviewsQuerySchema,
  reviewStatusSchema,
  type OrganizationReviewsQuery,
} from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import { DesignerReviews } from '@/components/designer-reviews';
import { requireCurrentDesignerProfile } from '@/lib/designer-profile';
import { getCurrentOrgRole } from '@/lib/current-org-role';
import { fetchOrganizationReviews } from '@/lib/reviews-api';

export const metadata = { title: 'Reviews · Tickif' };
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [profile, params, role, requestHeaders] = await Promise.all([
    requireCurrentDesignerProfile(),
    searchParams,
    getCurrentOrgRole(),
    headers(),
  ]);
  if (role !== 'owner' && role !== 'admin')
    return (
      <section className="p-6">
        <h1 className="text-2xl font-medium">Reviews</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The organization owner or admin can manage reviews.
        </p>
      </section>
    );
  const parsed = organizationReviewsQuerySchema.safeParse({
    designerProfileId: profile.id,
    status: params.status,
    page: params.page,
    limit: 10,
  });
  const query: OrganizationReviewsQuery = parsed.success
    ? parsed.data
    : { designerProfileId: profile.id, page: 1, limit: 10 };
  const data = await fetchOrganizationReviews(query, requestHeaders.get('cookie') ?? '');
  function href(page: number, status = query.status) {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    return `/designer/reviews?${params}`;
  }
  if (data.page > 1 && data.page > data.totalPages) redirect(href(Math.max(1, data.totalPages)));
  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6 p-5 sm:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Manage Tickif reviews for {profile.displayName}. Published reviews can be disputed with a
          reason.
        </p>
      </header>
      <nav aria-label="Review status" className="flex flex-wrap gap-2">
        <Button asChild variant={!query.status ? 'default' : 'outline'}>
          <Link href="/designer/reviews">All reviews</Link>
        </Button>
        {reviewStatusSchema.options
          .filter((status) => ['published', 'disputed', 'removed'].includes(status))
          .map((status) => (
            <Button asChild key={status} variant={query.status === status ? 'default' : 'outline'}>
              <Link href={href(1, status)}>{status}</Link>
            </Button>
          ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        {data.total} reviews · Page {data.page} of {Math.max(1, data.totalPages)}
      </p>
      <DesignerReviews data={data} />
      <nav aria-label="Review pages" className="flex gap-3">
        {data.page > 1 ? (
          <Button asChild variant="outline">
            <Link href={href(data.page - 1)}>Previous reviews</Link>
          </Button>
        ) : null}
        {data.page < data.totalPages ? (
          <Button asChild variant="outline">
            <Link href={href(data.page + 1)}>Next reviews</Link>
          </Button>
        ) : null}
      </nav>
    </section>
  );
}
