'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GoogleBrandIcon } from '@/components/brand-icons';
import { Star, UsersRound } from 'lucide-react';
import type { SearchDesignersQuery, SearchDesignersResponse } from '@repo/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/avatar';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent } from '@repo/ui/components/card';
import { EmptyState } from '@repo/ui/components/empty-state';
import {
  designerFacetLabel,
  designerPageHref,
  MAX_DESIGNER_PAGE,
} from '@/lib/designer-discovery-params';
import { fetchDesignerSearch } from '@/lib/designer-discovery-api';

function DesignerCard({
  designer,
  eagerImage,
}: {
  designer: SearchDesignersResponse['hits'][number];
  eagerImage: boolean;
}) {
  if (!designer.slug) return null;
  const summary = designer.tagline?.trim() || designer.bio?.trim();

  return (
    <article aria-label={designer.displayName} className="min-w-0">
      <Link
        href={`/d/${encodeURIComponent(designer.slug)}`}
        aria-label={`View ${designer.displayName} portfolio`}
        className="group block h-full cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Card className="flex h-full min-w-0 flex-col gap-0 overflow-hidden rounded-xl py-0 transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-lg group-focus-visible:border-primary/30 group-focus-visible:shadow-lg motion-reduce:group-hover:translate-y-0">
          <div className="relative aspect-[9/4] overflow-hidden bg-muted">
            {designer.heroUrl ? (
              <Image
                src={designer.heroUrl}
                alt={`${designer.displayName} portfolio cover`}
                width={800}
                height={350}
                unoptimized
                loading={eagerImage ? 'eager' : 'lazy'}
                sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
              />
            ) : null}
          </div>
          <CardContent className="flex min-h-32 flex-1 flex-col px-3 py-3">
            <div className="flex min-w-0 items-start gap-2">
              <Avatar className="size-10 shrink-0 rounded-lg bg-muted shadow-sm">
                <AvatarImage
                  src={designer.logoUrl ?? undefined}
                  alt={`${designer.displayName} logo`}
                  className="rounded-lg object-cover"
                />
                <AvatarFallback className="rounded-lg text-sm">
                  {designer.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-sm font-semibold leading-tight">
                  {designer.displayName}
                </h2>
                <p className="mt-1 truncate text-2xs text-muted-foreground">
                  {designer.entityType === 'company' ? 'Company' : 'Individual designer'}
                  {designer.citySlugs.length
                    ? ` · ${designer.citySlugs.map(designerFacetLabel).join(', ')}`
                    : ''}
                </p>
              </div>
              <p className="flex shrink-0 items-center gap-1 text-2xs">
                {designer.reviewCount > 0 ? (
                  <Star aria-hidden="true" className="size-3.5 fill-rating text-rating" />
                ) : null}
                {designer.reviewCount > 0
                  ? `${designer.avgRating.toFixed(1)} / 5 · ${designer.reviewCount} ${designer.reviewCount === 1 ? 'review' : 'reviews'}`
                  : 'No reviews yet'}
              </p>
            </div>
            <div className="mt-2 flex flex-1 flex-col gap-1">
              {summary ? (
                <p className="line-clamp-1 break-words text-2xs text-muted-foreground">{summary}</p>
              ) : null}
              <p className="text-2xs">
                {designer.yearsExperience} years of experience · {designer.projectCount} projects
              </p>
              {designer.googleRating !== null && designer.googleRatingCount !== null ? (
                <p className="flex items-center gap-1 text-2xs" aria-label="Google Business rating">
                  <GoogleBrandIcon className="size-3.5 shrink-0" />
                  <Star aria-hidden="true" className="size-3.5 fill-rating text-rating" />
                  <span className="sr-only">Google </span>
                  {designer.googleRating.toFixed(1)} · {designer.googleRatingCount}{' '}
                  {designer.googleRatingCount === 1 ? 'rating' : 'ratings'}
                </p>
              ) : null}
              <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-0.5">
                {designer.scopeSlugs.length ? (
                  <p className="truncate text-2xs text-muted-foreground">
                    {designer.scopeSlugs.map(designerFacetLabel).join(' · ')}
                  </p>
                ) : null}
                {designer.isKycVerified ? (
                  <Badge variant="secondary" size="compact" className="ml-auto">
                    KYC verified
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </article>
  );
}

function uniqueVisibleDesigners(pages: SearchDesignersResponse[]): SearchDesignersResponse['hits'] {
  const seenIds = new Set<string>();

  return pages
    .flatMap((page) => page.hits)
    .filter((designer) => {
      if (!designer.slug || seenIds.has(designer.id)) return false;
      seenIds.add(designer.id);
      return true;
    });
}

export function DesignerDiscoveryResults({
  result,
  query,
}: {
  result: SearchDesignersResponse;
  query: SearchDesignersQuery;
}) {
  const [appendedPages, setAppendedPages] = useState<SearchDesignersResponse[]>([]);
  const [page, setPage] = useState(result.page);
  const [estimatedTotalHits, setEstimatedTotalHits] = useState(result.estimatedTotalHits);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const visibleHits = uniqueVisibleDesigners([result, ...appendedPages]);
  const canLoadMore = page < MAX_DESIGNER_PAGE && page * result.limit < estimatedTotalHits;

  const loadNextPage = useCallback(async () => {
    if (!canLoadMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextPage = page + 1;
      const nextResult = await fetchDesignerSearch({ ...query, page: nextPage });
      setAppendedPages((current) => [...current, nextResult]);
      setPage(nextResult.page);
      setEstimatedTotalHits(nextResult.estimatedTotalHits);
    } catch {
      setLoadError('Could not load more designers. Please try again.');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [canLoadMore, page, query]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadNextPage]);

  return (
    <section aria-label="Designer results" className="flex flex-col gap-5">
      <p role="status" className="text-sm text-muted-foreground">
        {estimatedTotalHits} {estimatedTotalHits === 1 ? 'designer' : 'designers'} found
      </p>
      {visibleHits.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleHits.map((designer, index) => (
            <DesignerCard key={designer.id} designer={designer} eagerImage={index < 4} />
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
                href={
                  query.page > 1
                    ? designerPageHref(query, query.page - 1)
                    : designerPageHref({
                        ...query,
                        q: '',
                        page: 1,
                        citySlugs: undefined,
                        localitySlugs: undefined,
                        scopeSlugs: undefined,
                        themeSlugs: undefined,
                        entityType: undefined,
                      })
                }
              >
                {query.page > 1 ? 'Previous page' : 'Browse all designers'}
              </Link>
            </Button>
          }
        />
      )}
      {canLoadMore ? (
        <div
          ref={sentinelRef}
          className="flex min-h-24 flex-col items-center justify-center gap-3"
          aria-live="polite"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadNextPage()}
            disabled={isLoading}
          >
            {isLoading ? 'Loading more designers…' : 'Load more designers'}
          </Button>
          {loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
      ) : null}
      {page === MAX_DESIGNER_PAGE &&
      canLoadMore === false &&
      estimatedTotalHits > MAX_DESIGNER_PAGE * query.limit ? (
        <p className="text-center text-sm text-muted-foreground">
          Refine your search to see more designers.
        </p>
      ) : null}
    </section>
  );
}
