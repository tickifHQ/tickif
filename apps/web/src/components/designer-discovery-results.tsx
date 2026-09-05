import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import type { SearchDesignersQuery, SearchDesignersResponse } from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { EmptyState } from '@repo/ui/components/empty-state';
import {
  designerFacetLabel,
  designerPageHref,
  MAX_DESIGNER_PAGE,
} from '@/lib/designer-discovery-params';

export function DesignerDiscoveryResults({
  result,
  query,
}: {
  result: SearchDesignersResponse;
  query: SearchDesignersQuery;
}) {
  const visibleHits = result.hits.filter((hit) => hit.slug);
  const hasNext =
    query.page < MAX_DESIGNER_PAGE && query.page * query.limit < result.estimatedTotalHits;
  return (
    <section aria-label="Designer results" className="flex flex-col gap-5">
      <p role="status" className="text-sm text-muted-foreground">
        {result.estimatedTotalHits} designers found · Page {query.page}
      </p>
      {visibleHits.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleHits.map((designer) => (
            <article key={designer.id} aria-label={designer.displayName} className="min-w-0">
              <Card className="flex h-full min-w-0 flex-col">
                <CardHeader>
                  <Avatar className="size-14">
                    <AvatarImage src={designer.logoUrl ?? undefined} alt="" />
                    <AvatarFallback>
                      {designer.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <CardTitle>
                    <h2 className="break-words">{designer.displayName}</h2>
                  </CardTitle>
                  <CardDescription>
                    {designer.entityType === 'company' ? 'Company' : 'Individual designer'}
                    {designer.citySlugs.length
                      ? ` · ${designer.citySlugs.map(designerFacetLabel).join(', ')}`
                      : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {designer.isKycVerified ? (
                    <Badge variant="secondary" className="self-start">
                      KYC verified
                    </Badge>
                  ) : null}
                  {designer.bio ? (
                    <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                      {designer.bio}
                    </p>
                  ) : null}
                  <p className="text-sm">
                    {designer.yearsExperience} years of experience · {designer.projectCount}{' '}
                    projects
                  </p>
                  <p className="text-sm">
                    {designer.reviewCount > 0
                      ? `${designer.avgRating.toFixed(1)} / 5 · ${designer.reviewCount} reviews`
                      : 'No reviews yet'}
                  </p>
                  {designer.scopeSlugs.length ? (
                    <p className="text-sm text-muted-foreground">
                      {designer.scopeSlugs.map(designerFacetLabel).join(' · ')}
                    </p>
                  ) : null}
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline">
                    <Link
                      href={`/d/${encodeURIComponent(designer.slug!)}`}
                      aria-label={`View ${designer.displayName} profile`}
                    >
                      View profile
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          className="py-10"
          icon={<UsersRound />}
          title="No designers found"
          description="Try a different name or remove a filter to broaden your search."
          action={
            <Button asChild variant="outline">
              <Link
                href={designerPageHref({
                  ...query,
                  q: '',
                  page: 1,
                  citySlugs: undefined,
                  localitySlugs: undefined,
                  scopeSlugs: undefined,
                  themeSlugs: undefined,
                  entityType: undefined,
                })}
              >
                Browse all designers
              </Link>
            </Button>
          }
        />
      )}
      {query.page > 1 || hasNext ? (
        <nav
          aria-label="Designer pages"
          className="flex flex-wrap items-center justify-center gap-4"
        >
          {query.page > 1 ? (
            <Button asChild variant="outline">
              <Link rel="prev" href={designerPageHref(query, query.page - 1)}>
                Previous page
              </Link>
            </Button>
          ) : null}
          <span className="text-sm">Page {query.page}</span>
          {hasNext ? (
            <Button asChild variant="outline">
              <Link rel="next" href={designerPageHref(query, query.page + 1)}>
                Next page
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
      {query.page === MAX_DESIGNER_PAGE &&
      hasNext === false &&
      result.estimatedTotalHits > MAX_DESIGNER_PAGE * query.limit ? (
        <p className="text-center text-sm text-muted-foreground">
          Refine your search to see more designers.
        </p>
      ) : null}
    </section>
  );
}
