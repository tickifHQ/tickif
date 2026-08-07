'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Button } from '@repo/ui/components/button';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard, type FeedFilterSuggestion } from '@/components/try-filter-card';
import { fetchHomeFeedPage, type HomeFeedPage, type HomeFeedRequest } from '@/lib/home-feed';

const TRY_FILTER_INDEX = 13;

const FILTER_LABELS: Record<string, string> = {
  budgetBandSlug: 'budget',
  bhkSlug: 'BHK',
  citySlug: 'city',
  propertyTypeSlug: 'property type',
  roomSlugs: 'room',
  scopeSlug: 'scope',
  themes: 'theme',
};

type ProjectFeedProps = {
  initialPage: HomeFeedPage;
  request: HomeFeedRequest;
  infinite?: boolean;
  showTryFilter?: boolean;
  filterSuggestions?: FeedFilterSuggestion[];
};

function relaxedFilterMessage(filters: string[]): string {
  const labels = filters.map((filter) => FILTER_LABELS[filter] ?? filter);
  if (labels.length === 0) return '';
  return `We broadened your results by relaxing ${labels.join(', ')}.`;
}

/** SSR-first masonry feed that appends subsequent API pages as the sentinel enters view. */
export function ProjectFeed({
  initialPage,
  request,
  infinite = true,
  showTryFilter = true,
  filterSuggestions = [],
}: ProjectFeedProps) {
  const [items, setItems] = useState(initialPage.items);
  const [page, setPage] = useState(initialPage.page);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initialPage.items);
    setPage(initialPage.page);
    setHasMore(initialPage.hasMore);
    setLoadError(null);
  }, [initialPage]);

  const loadNextPage = useCallback(async () => {
    if (!infinite || !hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextPage = page + 1;
      const result = await fetchHomeFeedPage(request, nextPage);

      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);

      const url = new URL(window.location.href);
      url.searchParams.set('page', String(result.page));
      window.history.replaceState(window.history.state, '', url);
    } catch {
      setLoadError('Could not load more projects. Please try again.');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, infinite, page, request]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !infinite || !hasMore || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, infinite, loadNextPage]);

  if (items.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={<SearchX className="size-5" aria-hidden />}
        title={request.query ? 'No matching projects' : 'No projects found'}
        description={
          request.query
            ? `We could not find projects matching “${request.query}”. Try a broader search or remove a filter.`
            : 'Try removing a filter or check back when more projects are published.'
        }
        action={
          <Button asChild variant="outline" size="sm">
            <a href="/">Clear search and filters</a>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      {initialPage.fallback !== 'none' ? (
        <p
          className="mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {initialPage.fallback === 'recent_in_city'
            ? 'Exact matches were unavailable, so we are showing recent projects in this city.'
            : relaxedFilterMessage(initialPage.relaxedFilters)}
        </p>
      ) : null}

      <div className="columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {items.map((project, index) => (
          <Fragment key={project.id}>
            {showTryFilter && filterSuggestions.length > 0 && index === TRY_FILTER_INDEX ? (
              <TryFilterCard suggestions={filterSuggestions} />
            ) : null}
            <ShowcaseCard project={project} priority={index < 4} />
          </Fragment>
        ))}
      </div>

      {infinite && hasMore ? (
        <div
          ref={sentinelRef}
          className="flex min-h-24 items-center justify-center"
          aria-live="polite"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadNextPage()}
            disabled={isLoading}
          >
            {isLoading ? 'Loading more projects…' : 'Load more projects'}
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <p className="py-4 text-center text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
