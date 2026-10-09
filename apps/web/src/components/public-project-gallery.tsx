'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, SlidersHorizontal } from 'lucide-react';
import type { DesignerProjectCard, DesignerProjectsResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from '@repo/ui/components/pagination';
import { cn } from '@repo/ui/lib/utils';
import { PublicProjectCard } from '@/components/public-project-card';
import { fetchDesignerProjects } from '@/lib/public-portfolio-api';
import { projectFilters } from '@/lib/public-portfolio-view';

const INITIAL_VISIBLE_COUNT = 6;

/**
 * Sorts backed by fields the API actually returns. "Featured" keeps the API's
 * order (newest published first), which is what the designer's own ordering means.
 */
const SORT_OPTIONS = ['Featured', 'Newest', 'Top rated', 'Largest'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const ALL_FILTER = 'All';

function sortProjects(projects: DesignerProjectCard[], sort: SortOption): DesignerProjectCard[] {
  const sorted = [...projects];

  // Projects missing the sort field fall to the end rather than jumbling the top.
  const byDesc = (value: (project: DesignerProjectCard) => number | null) =>
    sorted.sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity));

  switch (sort) {
    case 'Newest':
      return byDesc((project) => project.completionYear);
    case 'Top rated':
      return byDesc((project) => project.rating);
    case 'Largest':
      return byDesc((project) => project.sizeSqft);
    case 'Featured':
      return sorted;
  }
}

/**
 * The public portfolio project grid.
 *
 * Renders the first page delivered with the portfolio payload, then fetches
 * further API pages on demand. Every displayed page contains at most six
 * cards; sorting and filtering apply to the loaded projects.
 */
export function PublicProjectGallery({
  profileId,
  initialPage,
  studioName,
  emptyMessage,
}: {
  profileId: string;
  initialPage: DesignerProjectsResponse;
  studioName: string;
  emptyMessage: string;
}) {
  const [projects, setProjects] = useState<DesignerProjectCard[]>(initialPage.projects);
  const [page, setPage] = useState(initialPage.page);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [sort, setSort] = useState<SortOption>('Featured');
  const [filter, setFilter] = useState<string>(ALL_FILTER);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayPage, setDisplayPage] = useState(0);

  // Filtering only helps once the portfolio spans more than one property type.
  const facets = useMemo(() => projectFilters(projects), [projects]);
  const canFilter = facets.length > 1;
  const filterOptions = [ALL_FILTER, ...facets];

  const filteredProjects = useMemo(() => {
    const matching =
      filter === ALL_FILTER
        ? projects
        : projects.filter((project) => project.propertyType?.includes(filter));
    return sortProjects(matching, sort);
  }, [filter, projects, sort]);

  const offset = displayPage * INITIAL_VISIBLE_COUNT;
  const visibleProjects = filteredProjects.slice(offset, offset + INITIAL_VISIBLE_COUNT);
  const visibleCount = visibleProjects.length;
  const canAdvance = offset + INITIAL_VISIBLE_COUNT < filteredProjects.length || hasMore;

  function handleNext() {
    if (offset + INITIAL_VISIBLE_COUNT < filteredProjects.length) {
      setDisplayPage((current) => current + 1);
      return;
    }
    if (!hasMore || isPending) return;

    startTransition(async () => {
      try {
        const next = await fetchDesignerProjects(profileId, {
          page: page + 1,
          limit: initialPage.limit,
        });
        setProjects((current) => [...current, ...next.projects]);
        setPage(next.page);
        setHasMore(next.hasMore);
        setLoadError(null);
        const addedMatches = next.projects.filter(
          (project) => filter === ALL_FILTER || project.propertyType?.includes(filter),
        ).length;
        if (filteredProjects.length + addedMatches > offset + INITIAL_VISIBLE_COUNT) {
          setDisplayPage((current) => current + 1);
        }
      } catch {
        // Already-loaded projects stay on screen; only the extra page is missing.
        setLoadError('Could not load more projects. Please try again.');
      }
    });
  }

  if (projects.length === 0) {
    return (
      <p className="mt-9 border-t py-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 py-2">
        <p
          className="font-mono text-metadata uppercase text-muted-foreground"
          data-testid="project-count"
          aria-live="polite"
        >
          {visibleCount}{' '}
          <span className="font-normal text-muted-foreground">
            of {filteredProjects.length} projects
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-0.5" aria-label="Project sorting">
            {SORT_OPTIONS.map((option) => (
              <Button
                key={option}
                type="button"
                variant={sort === option ? 'emphasis' : 'ghost'}
                size="sm"
                className="h-8 cursor-pointer text-xs"
                aria-pressed={sort === option}
                disabled={isPending}
                onClick={() => {
                  setSort(option);
                  setDisplayPage(0);
                }}
              >
                {option}
              </Button>
            ))}
          </div>
          {canFilter ? (
            <Button
              type="button"
              variant="outline"
              className="h-8 cursor-pointer px-3"
              aria-expanded={filtersOpen}
              disabled={isPending}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-3" />
              Filters
            </Button>
          ) : null}
        </div>
      </div>

      {canFilter ? (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
            filtersOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
          aria-hidden={!filtersOpen}
          inert={!filtersOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-wrap gap-2 border-b py-3">
              {filterOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={filter === option ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 cursor-pointer"
                  aria-pressed={filter === option}
                  disabled={isPending}
                  onClick={() => {
                    setFilter(option);
                    setDisplayPage(0);
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div
        data-testid="visible-projects"
        className="mt-5 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3"
      >
        {visibleProjects.map((project) => (
          <PublicProjectCard key={project.id} project={project} studioName={studioName} />
        ))}
      </div>

      {loadError ? (
        <p role="status" className="mt-6 text-center text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {filteredProjects.length > INITIAL_VISIBLE_COUNT || hasMore ? (
        <Pagination aria-label="Project pages" className="mt-8">
          <PaginationContent className="flex-wrap justify-center">
            <PaginationItem>
              <PaginationLink asChild className="has-disabled:opacity-40">
                <button
                  type="button"
                  disabled={isPending || displayPage === 0}
                  onClick={() => setDisplayPage((current) => current - 1)}
                >
                  <ArrowLeft className="size-3" /> Previous projects
                </button>
              </PaginationLink>
            </PaginationItem>
            {Array.from(
              { length: Math.max(1, Math.ceil(filteredProjects.length / INITIAL_VISIBLE_COUNT)) },
              (_, index) => index,
            )
              .filter(
                (index) =>
                  index === 0 ||
                  index === Math.ceil(filteredProjects.length / INITIAL_VISIBLE_COUNT) - 1 ||
                  Math.abs(index - displayPage) <= 1,
              )
              .map((index, itemIndex, items) => (
                <PaginationItem key={index} className="flex">
                  {itemIndex > 0 && index - items[itemIndex - 1]! > 1 ? (
                    <PaginationEllipsis />
                  ) : null}
                  <PaginationLink asChild isActive={index === displayPage}>
                    <button
                      type="button"
                      aria-label={`Go to project page ${index + 1}`}
                      disabled={isPending}
                      onClick={() => setDisplayPage(index)}
                    >
                      {index + 1}
                    </button>
                  </PaginationLink>
                </PaginationItem>
              ))}
            <PaginationItem>
              <PaginationLink asChild className="has-disabled:opacity-40">
                <button type="button" disabled={isPending || !canAdvance} onClick={handleNext}>
                  {isPending ? 'Loading projects…' : 'Next projects'}
                  <ArrowRight className="size-3" />
                </button>
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </>
  );
}
