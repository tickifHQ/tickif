'use client';

import { Fragment, useState, useTransition } from 'react';
import type { FeedProject } from '@repo/contracts';
import { feedProjectsResponseSchema, discoveryFeedResponseSchema } from '@repo/contracts';
import type { FilterChip } from '@/components/feed-filters';
import { FeedFilters } from '@/components/feed-filters';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard } from '@/components/try-filter-card';
import { api } from '@/lib/api';
import { env } from '@/env';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

const TRY_FILTER_INDEX = 13;
const PAGE_SIZE = 24;

type FeedItem = FeedProject | DiscoveryCardAdapter;

interface DiscoveryCardAdapter {
  id: string;
  slug: string;
  title: string;
  studio: string;
  city: string | null;
  locality: string | null;
  rating: number;
  reviewCount: number;
  budget: string | null;
  tags: string[];
  coverImageId: string | null;
  coverImageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

interface DiscoveryFeedSectionProps {
  initialProjects: FeedProject[];
  initialHasMore: boolean;
  filterChips: FilterChip[];
  budgetChips: FilterChip[];
}

/** Deduplicate feed items by id, preserving order and keeping the first occurrence. */
function deduplicateById(existing: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const seen = new Set(existing.map((p) => p.id));
  return incoming.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function mapDiscoveryCard(card: { slug: string; title: string; designerName: string; city: string | null; bhk: string | null; coverImageUrl: string | null; coverImageWidth: number | null; coverImageHeight: number | null }): FeedItem {
  return {
    id: card.slug,
    slug: card.slug,
    title: card.title,
    studio: card.designerName,
    city: card.city,
    locality: null,
    rating: 0,
    reviewCount: 0,
    budget: card.bhk,
    tags: [],
    coverImageId: null,
    coverImageUrl: card.coverImageUrl,
    imageWidth: card.coverImageWidth,
    imageHeight: card.coverImageHeight,
  };
}

export function DiscoveryFeedSection({
  initialProjects,
  initialHasMore,
  filterChips,
  budgetChips,
}: DiscoveryFeedSectionProps) {
  const [projects, setProjects] = useState<FeedItem[]>(initialProjects);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<FilterChip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFiltering, startFilterTransition] = useTransition();
  const [isLoadingMore, startLoadMoreTransition] = useTransition();

  function handleFilterChange(filter: FilterChip | null) {
    setActiveFilter(filter);
    setPage(1);
    setError(null);

    if (!filter) {
      setProjects(initialProjects);
      setHasMore(initialHasMore);
      return;
    }

    startFilterTransition(async () => {
      try {
        const params = new URLSearchParams({
          [filter.kind]: filter.slug,
          limit: String(PAGE_SIZE),
          page: '1',
        });
        const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/discovery/feed?${params}`, {
          credentials: 'include',
        });
        if (!response.ok) {
          setError('Something went wrong loading projects. Please try again.');
          return;
        }
        const payload = await response.json();
        const parsed = discoveryFeedResponseSchema.safeParse(payload);
        if (!parsed.success) {
          setError('Something went wrong loading projects. Please try again.');
          return;
        }

        setProjects(parsed.data.items.map(mapDiscoveryCard));
        setHasMore(parsed.data.hasMore);
      } catch {
        setError('Something went wrong loading projects. Please try again.');
      }
    });
  }

  function loadMore() {
    const nextPage = page + 1;

    startLoadMoreTransition(async () => {
      try {
        if (activeFilter) {
          const params = new URLSearchParams({
            [activeFilter.kind]: activeFilter.slug,
            limit: String(PAGE_SIZE),
            page: String(nextPage),
          });
          const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/discovery/feed?${params}`, {
            credentials: 'include',
          });
          if (!response.ok) return;
          const payload = await response.json();
          const parsed = discoveryFeedResponseSchema.safeParse(payload);
          if (!parsed.success) return;

          const newItems = parsed.data.items.map(mapDiscoveryCard);
          setProjects((prev) => [...prev, ...deduplicateById(prev, newItems)]);
          setHasMore(parsed.data.hasMore);
        } else {
          const response = await api.api.projects.feed.$get({
            query: { page: String(nextPage), limit: String(PAGE_SIZE) },
          });
          if (!response.ok) return;
          const payload = await response.json();
          const parsed = feedProjectsResponseSchema.safeParse(payload);
          if (!parsed.success) return;

          setProjects((prev) => [...prev, ...deduplicateById(prev, parsed.data.projects)]);
          setHasMore(parsed.data.hasMore);
        }
        setPage(nextPage);
      } catch {
        // Load more failure: user can retry by clicking again
      }
    });
  }

  return (
    <div>
      <FeedFilters
        chips={filterChips}
        activeFilter={activeFilter}
        onFilterChange={handleFilterChange}
      />

      <div className="mt-4">
        {isFiltering ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            <span className="sr-only">Loading filtered results…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <AlertCircle className="size-5 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={() => handleFilterChange(activeFilter)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent"
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">No projects match this filter.</p>
          </div>
        ) : (
          <div className="columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
            {projects.map((project, index) => (
              <Fragment key={project.id ?? index}>
                {index === TRY_FILTER_INDEX && <TryFilterCard budgetChips={budgetChips} />}
                <ShowcaseCard project={project as FeedProject} />
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {hasMore && !isFiltering && !error && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isLoadingMore ? 'Loading…' : 'Load more projects'}
          </button>
        </div>
      )}
    </div>
  );
}
