'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Button } from '@repo/ui/components/button';
import { FeedPagination } from '@/components/feed-pagination';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard, type FeedFilterSuggestion } from '@/components/try-filter-card';
import { feedPageHref, MAX_HOME_FEED_PAGE } from '@/lib/feed-params';
import { fetchHomeFeedPage, type HomeFeedPage, type HomeFeedRequest } from '@/lib/home-feed';

const TRY_FILTER_INDEX = 13;
/**
 * CSS multi-column masonry. The column count is declared per breakpoint so the
 * server-rendered markup is already correct — no measuring pass, and the layout
 * survives with JavaScript disabled.
 */
const MASONRY_CLASS_NAME = 'columns-2 gap-x-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6';

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
  /**
   * Canonical query params (query + filters, no `page`) for the crawlable feed.
   * Supplying them renders the visible prev/next control; omit them for
   * secondary strips such as the featured rail.
   */
  paginationParams?: Record<string, string | string[] | undefined>;
};

type RenderedFeedPage = Pick<HomeFeedPage, 'items' | 'page'>;

type FeedEntry =
  | {
      kind: 'project';
      page: number;
      priority: boolean;
      project: HomeFeedPage['items'][number];
    }
  | { kind: 'try-filter' };

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
  paginationParams,
}: ProjectFeedProps) {
  const [renderedPages, setRenderedPages] = useState<RenderedFeedPage[]>([
    { items: initialPage.items, page: initialPage.page },
  ]);
  const [page, setPage] = useState(initialPage.page);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = infinite && hasMore && page < MAX_HOME_FEED_PAGE;
  // `page` tracks the newest page already appended, so "Next page" never links at
  // something the visitor is already looking at.
  const previousHref =
    paginationParams && initialPage.page > 1
      ? feedPageHref(paginationParams, initialPage.page - 1)
      : null;
  const nextHref =
    paginationParams && hasMore && page < MAX_HOME_FEED_PAGE
      ? feedPageHref(paginationParams, page + 1)
      : null;
  const fallbackMessage =
    initialPage.fallback === 'recent_in_city'
      ? 'Exact matches were unavailable, so we are showing recent projects in this city.'
      : initialPage.fallback === 'relaxed'
        ? relaxedFilterMessage(initialPage.relaxedFilters)
        : '';

  useEffect(() => {
    setRenderedPages([{ items: initialPage.items, page: initialPage.page }]);
    setPage(initialPage.page);
    setHasMore(initialPage.hasMore);
    setLoadError(null);
  }, [initialPage]);

  const loadNextPage = useCallback(async () => {
    if (!canLoadMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextPage = page + 1;
      const result = await fetchHomeFeedPage(request, nextPage);

      setRenderedPages((currentPages) => {
        const seen = new Set(
          currentPages.flatMap((currentPage) => currentPage.items.map((item) => item.id)),
        );
        const nextItems = result.items.filter((item) => !seen.has(item.id));
        return nextItems.length > 0
          ? [...currentPages, { items: nextItems, page: result.page }]
          : currentPages;
      });
      setPage(result.page);
      setHasMore(result.hasMore && result.page < MAX_HOME_FEED_PAGE);
    } catch {
      setLoadError('Could not load more projects. Please try again.');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [canLoadMore, page, request]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore || typeof IntersectionObserver === 'undefined') {
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
  }, [canLoadMore, loadNextPage]);

  if (renderedPages.every((renderedPage) => renderedPage.items.length === 0)) {
    return (
      <div>
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
        {/* An over-run page still needs a way back to the results. */}
        <FeedPagination page={initialPage.page} previousHref={previousHref} nextHref={null} />
      </div>
    );
  }

  const entries = renderedPages.flatMap((renderedPage, pageIndex) =>
    renderedPage.items.flatMap((project, index): FeedEntry[] => {
      const projectEntry: FeedEntry = {
        kind: 'project',
        page: renderedPage.page,
        priority: pageIndex === 0 && index < 4,
        project,
      };

      return pageIndex === 0 &&
        showTryFilter &&
        filterSuggestions.length > 0 &&
        index === TRY_FILTER_INDEX
        ? [{ kind: 'try-filter' }, projectEntry]
        : [projectEntry];
    }),
  );

  return (
    <div>
      {fallbackMessage ? (
        <p
          className="mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          {fallbackMessage}
        </p>
      ) : null}

      <div data-masonry-feed className={MASONRY_CLASS_NAME}>
        {entries.map((entry) =>
          entry.kind === 'try-filter' ? (
            <TryFilterCard key="try-filter" suggestions={filterSuggestions} />
          ) : (
            <div key={entry.project.id} data-feed-page={entry.page} className="break-inside-avoid">
              <ShowcaseCard project={entry.project} priority={entry.priority} />
            </div>
          ),
        )}
      </div>

      {canLoadMore ? (
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

      <FeedPagination page={initialPage.page} previousHref={previousHref} nextHref={nextHref} />
    </div>
  );
}
