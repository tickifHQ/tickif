'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@repo/ui/components/empty-state';
import { Button } from '@repo/ui/components/button';
import { FeedPagination } from '@/components/feed-pagination';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard, type FeedFilterSuggestion } from '@/components/try-filter-card';
import { feedPageHref, FEED_FILTER_KEYS, MAX_HOME_FEED_PAGE } from '@/lib/feed-params';
import { fetchHomeFeedPage, type HomeFeedPage, type HomeFeedRequest } from '@/lib/home-feed';

const MAX_FILTER_CARDS = 2;
const MIN_PROJECTS_PER_FILTER_CARD = 8;
const MIN_SUGGESTIONS_PER_FILTER_CARD = 2;
const FIRST_CARD_MIN_INDEX = 4;
const MASONRY_FALLBACK_CLASS_NAME =
  'columns-2 gap-x-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6';
const MASONRY_COLUMN_COUNT_CLASS_NAME =
  '[--masonry-columns:2] md:[--masonry-columns:3] lg:[--masonry-columns:4] xl:[--masonry-columns:5] 2xl:[--masonry-columns:6]';

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
   * Generated on the server for each navigation. The results component keeps
   * the initial value so equivalent RSC refreshes cannot move cards while the
   * visitor is reading or scrolling the feed.
   */
  filterCardPlacementSeed?: number;
  /**
   * Canonical query params (query + filters, no `page`) for finite feeds.
   * Infinite discovery feeds intentionally omit visible pagination even when
   * these params are present for server-owned crawl metadata.
   */
  paginationParams?: Record<string, string | string[] | undefined>;
  /**
   * Feed base for finite prev/next links and the empty-state reset.
   * The shared feed also renders inside the signed-in /home workspace, where
   * those links must stay on /home instead of pointing at the public homepage.
   */
  paginationBase?: string;
};

type RenderedFeedPage = Pick<HomeFeedPage, 'items' | 'page'>;

type FeedEntry =
  | {
      kind: 'project';
      page: number;
      priority: boolean;
      project: HomeFeedPage['items'][number];
    }
  | { id: string; kind: 'try-filter'; suggestions: FeedFilterSuggestion[] };

type FilterCardPlacement = {
  id: string;
  index: number;
  suggestions: FeedFilterSuggestion[];
};

function seededIndex(seed: number, salt: number, start: number, end: number): number {
  const range = end - start + 1;
  if (range <= 1) return start;

  // Integer mixing gives each placement band an independent value without
  // calling Math.random during client rendering.
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  value ^= value >>> 15;
  return start + ((value >>> 0) % range);
}

function filterCardPlacements(
  projectCount: number,
  suggestions: FeedFilterSuggestion[],
  seed: number,
): FilterCardPlacement[] {
  const possibleCardCount = Math.floor(projectCount / MIN_PROJECTS_PER_FILTER_CARD);
  const suggestionCardCount = Math.floor(suggestions.length / MIN_SUGGESTIONS_PER_FILTER_CARD);
  const cardCount = Math.min(MAX_FILTER_CARDS, possibleCardCount, suggestionCardCount);
  if (cardCount === 0) return [];

  const suggestionsPerCard = Math.ceil(suggestions.length / cardCount);
  const midpoint = Math.floor(projectCount / 2);

  return Array.from({ length: cardCount }, (_, cardIndex) => {
    const isFirstOfTwo = cardCount === 2 && cardIndex === 0;
    const isSecondOfTwo = cardCount === 2 && cardIndex === 1;
    const start = isSecondOfTwo ? midpoint + 2 : FIRST_CARD_MIN_INDEX;
    const end = isFirstOfTwo ? midpoint - 2 : projectCount - 1;

    return {
      id: `try-filter-${cardIndex + 1}`,
      index: seededIndex(seed, cardIndex, start, end),
      suggestions: suggestions.slice(
        cardIndex * suggestionsPerCard,
        (cardIndex + 1) * suggestionsPerCard,
      ),
    };
  });
}

function estimatedEntryHeight(entry: FeedEntry): number {
  if (entry.kind === 'try-filter') return 0.8 + entry.suggestions.length * 0.16;

  const width = entry.project.imageWidth;
  const height = entry.project.imageHeight;
  return width !== null && width > 0 && height !== null && height > 0 ? height / width : 1.25;
}

function distributeEntries(entries: FeedEntry[], columnCount: number): FeedEntry[][] {
  const columns = Array.from({ length: columnCount }, () => [] as FeedEntry[]);
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const filterCardColumns = new Set<number>();

  for (const entry of entries) {
    const availableColumns = Array.from({ length: columnCount }, (_, index) => index).filter(
      (index) => entry.kind !== 'try-filter' || !filterCardColumns.has(index),
    );
    const candidateColumns = availableColumns.length > 0 ? availableColumns : [0];
    let shortestColumn = candidateColumns[0]!;
    for (const index of candidateColumns.slice(1)) {
      if (columnHeights[index]! < columnHeights[shortestColumn]!) shortestColumn = index;
    }
    columns[shortestColumn]!.push(entry);
    columnHeights[shortestColumn]! += estimatedEntryHeight(entry);
    if (entry.kind === 'try-filter') filterCardColumns.add(shortestColumn);
  }

  return columns;
}

function FeedEntryCard({
  entry,
  hasActiveCriteria,
}: {
  entry: FeedEntry;
  hasActiveCriteria: boolean;
}) {
  return entry.kind === 'try-filter' ? (
    <TryFilterCard suggestions={entry.suggestions} hasActiveCriteria={hasActiveCriteria} />
  ) : (
    <div data-feed-page={entry.page} className="break-inside-avoid">
      <ShowcaseCard project={entry.project} priority={entry.priority} />
    </div>
  );
}

function StableMasonry({
  entries,
  hasActiveCriteria,
}: {
  entries: FeedEntry[];
  hasActiveCriteria: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateColumnCount = () => {
      const nextColumnCount = Number.parseInt(
        window.getComputedStyle(container).getPropertyValue('--masonry-columns'),
        10,
      );
      if (Number.isFinite(nextColumnCount) && nextColumnCount > 0) {
        setColumnCount((current) => (current === nextColumnCount ? current : nextColumnCount));
      }
    };

    updateColumnCount();
    const observer = new ResizeObserver(updateColumnCount);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(
    () => (columnCount === null ? null : distributeEntries(entries, columnCount)),
    [columnCount, entries],
  );

  if (columns === null) {
    return (
      <div
        ref={containerRef}
        data-masonry-feed
        className={`${MASONRY_FALLBACK_CLASS_NAME} ${MASONRY_COLUMN_COUNT_CLASS_NAME}`}
      >
        {entries.map((entry) => (
          <FeedEntryCard
            key={entry.kind === 'try-filter' ? entry.id : entry.project.id}
            entry={entry}
            hasActiveCriteria={hasActiveCriteria}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-masonry-feed
      data-masonry-mode="stable"
      className={`grid gap-x-4 ${MASONRY_COLUMN_COUNT_CLASS_NAME}`}
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} data-feed-column={columnIndex} className="min-w-0">
          {column.map((entry) => (
            <FeedEntryCard
              key={entry.kind === 'try-filter' ? entry.id : entry.project.id}
              entry={entry}
              hasActiveCriteria={hasActiveCriteria}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function relaxedFilterMessage(filters: string[]): string {
  const labels = filters.map((filter) => FILTER_LABELS[filter] ?? filter);
  if (labels.length === 0) return '';
  return `We broadened your results by relaxing ${labels.join(', ')}.`;
}

function stableCoverImageUrl(value: string | null): string | null {
  if (!value) return value;

  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('x-amz-')) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

function initialFeedKey(initialPage: HomeFeedPage): string {
  return JSON.stringify([
    initialPage.page,
    initialPage.hasMore,
    initialPage.items.map(({ coverImageUrl, ...item }) => [
      item,
      stableCoverImageUrl(coverImageUrl),
    ]),
  ]);
}

/** SSR-first masonry feed that appends subsequent API pages as the sentinel enters view. */
export function ProjectFeed(props: ProjectFeedProps) {
  // RSC refreshes can send equivalent objects with new identities. Keep appended
  // pages for the same search, and isolate pending requests when navigation
  // changes the query, filters, sort, or starting page. A material server-data
  // refresh also starts a new feed instead of keeping outdated cards.
  const feedKey = JSON.stringify([
    props.request.query,
    props.request.sort ?? 'recent',
    ...FEED_FILTER_KEYS.map((key) => [...props.request.filters[key]].sort()),
    initialFeedKey(props.initialPage),
  ]);
  return <ProjectFeedResults key={feedKey} {...props} />;
}

function ProjectFeedResults({
  initialPage,
  request,
  infinite = true,
  showTryFilter = true,
  filterSuggestions = [],
  filterCardPlacementSeed = 0,
  paginationParams,
  paginationBase = '/',
}: ProjectFeedProps) {
  const [appendedPages, setAppendedPages] = useState<RenderedFeedPage[]>([]);
  const [page, setPage] = useState(initialPage.page);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stableFilterCardPlacementSeed] = useState(filterCardPlacementSeed);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = infinite && hasMore && page < MAX_HOME_FEED_PAGE;
  // The server-owned first page stays fresh when its presigned image URLs rotate;
  // only subsequent client-fetched pages live in state.
  const renderedPages: RenderedFeedPage[] = [
    { items: initialPage.items, page: initialPage.page },
    ...appendedPages,
  ];
  // Finite feeds retain reusable server pagination. Infinite discovery feeds use
  // only their sentinel and load-more fallback so the UI exposes one navigation model.
  const previousHref =
    paginationParams && initialPage.page > 1
      ? feedPageHref(paginationParams, initialPage.page - 1, paginationBase)
      : null;
  const nextHref =
    paginationParams && hasMore && page < MAX_HOME_FEED_PAGE
      ? feedPageHref(paginationParams, page + 1, paginationBase)
      : null;
  const fallbackMessage =
    initialPage.fallback === 'recent_in_city'
      ? 'Exact matches were unavailable, so we are showing recent projects in this city.'
      : initialPage.fallback === 'relaxed'
        ? relaxedFilterMessage(initialPage.relaxedFilters)
        : '';
  const hasActiveCriteria =
    request.query.length > 0 || FEED_FILTER_KEYS.some((key) => request.filters[key].length > 0);

  const loadNextPage = useCallback(async () => {
    if (!canLoadMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextPage = page + 1;
      const result = await fetchHomeFeedPage(request, nextPage);

      setAppendedPages((currentPages) => {
        const seen = new Set(
          [initialPage, ...currentPages].flatMap((currentPage) =>
            currentPage.items.map((item) => item.id),
          ),
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
  }, [canLoadMore, initialPage, page, request]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !canLoadMore || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
      },
      // Begin before the visitor reaches the boundary so the next stable masonry
      // entries are usually ready by the time they scroll into view.
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
              <a href={paginationBase}>Clear search and filters</a>
            </Button>
          }
        />
        {!infinite ? (
          <FeedPagination page={initialPage.page} previousHref={previousHref} nextHref={null} />
        ) : null}
      </div>
    );
  }

  const placements = showTryFilter
    ? filterCardPlacements(
        initialPage.items.length,
        filterSuggestions,
        stableFilterCardPlacementSeed,
      )
    : [];
  const placementsByIndex = new Map(placements.map((placement) => [placement.index, placement]));
  const entries = renderedPages.flatMap((renderedPage, pageIndex) =>
    renderedPage.items.flatMap((project, index): FeedEntry[] => {
      const projectEntry: FeedEntry = {
        kind: 'project',
        page: renderedPage.page,
        priority: pageIndex === 0 && index < 4,
        project,
      };

      const placement = pageIndex === 0 ? placementsByIndex.get(index) : undefined;
      return placement
        ? [
            {
              id: placement.id,
              kind: 'try-filter',
              suggestions: placement.suggestions,
            },
            projectEntry,
          ]
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

      <StableMasonry entries={entries} hasActiveCriteria={hasActiveCriteria} />

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

      {!infinite ? (
        <FeedPagination page={initialPage.page} previousHref={previousHref} nextHref={nextHref} />
      ) : null}
    </div>
  );
}
