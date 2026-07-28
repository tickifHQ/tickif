'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowDown, SlidersHorizontal } from 'lucide-react';
import type { DesignerProjectCard, DesignerProjectsResponse } from '@repo/contracts';
import { Button } from '@repo/ui/components/button';
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
 * further pages from `/api/profiles/{id}/projects` when the visitor asks for
 * more. Sorting and filtering apply to what is loaded — the API's 30-per-page
 * ceiling means that is the full portfolio for all but the largest studios, and
 * "View all projects" keeps loading until it is.
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
  const [showAll, setShowAll] = useState(false);

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

  const visibleProjects = filteredProjects.slice(0, INITIAL_VISIBLE_COUNT);
  const additionalProjects = filteredProjects.slice(INITIAL_VISIBLE_COUNT);
  const visibleCount = showAll ? filteredProjects.length : visibleProjects.length;

  /** Reveal the rest of what's loaded, pulling the next page first when there is one. */
  function handleViewAll() {
    if (showAll) {
      setShowAll(false);
      return;
    }
    setShowAll(true);
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
      } catch {
        // Already-loaded projects stay on screen; only the extra page is missing.
        setLoadError('Could not load more projects. Please try again.');
      }
    });
  }

  if (projects.length === 0) {
    return (
      <p className="mt-9 border-t py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <>
      <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <p className="text-sm font-medium" data-testid="project-count" aria-live="polite">
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
                className="h-8 cursor-pointer"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
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
                  onClick={() => {
                    setFilter(option);
                    setShowAll(false);
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
        className="mt-8 grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visibleProjects.map((project) => (
          <PublicProjectCard key={project.id} project={project} studioName={studioName} />
        ))}
      </div>

      <div
        data-testid="additional-projects"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none',
          showAll ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!showAll}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-x-6 gap-y-7 pt-7 sm:grid-cols-2 lg:grid-cols-3">
            {additionalProjects.map((project) => (
              <PublicProjectCard key={project.id} project={project} studioName={studioName} />
            ))}
          </div>
        </div>
      </div>

      {loadError ? (
        <p role="status" className="mt-6 text-center text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {additionalProjects.length > 0 || hasMore ? (
        <div className="mt-12 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="h-11 cursor-pointer gap-1 px-5 shadow-sm"
            aria-expanded={showAll}
            disabled={isPending}
            onClick={handleViewAll}
          >
            {isPending ? 'Loading projects…' : showAll ? 'Show fewer projects' : 'View all projects'}
            <ArrowDown
              className={cn(
                'size-3 transition-transform duration-300 motion-reduce:transition-none',
                showAll ? 'rotate-180' : 'rotate-0',
              )}
            />
          </Button>
        </div>
      ) : null}
    </>
  );
}
