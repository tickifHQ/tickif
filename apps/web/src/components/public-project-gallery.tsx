'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@repo/ui/components/button';
import { cn } from '@repo/ui/lib/utils';
import { PublicProjectCard } from '@/components/public-project-card';
import type { PublicDesignerProject } from '@/lib/public-designer-profile-fixture';

const initialProjectCount = 6;
const sortOptions = ['Featured', 'Newest', 'Most viewed', 'Top rated', 'Largest'] as const;
const filterOptions = ['All', 'Apartment', 'Villa'] as const;

type SortOption = (typeof sortOptions)[number];
type FilterOption = (typeof filterOptions)[number];

function sortProjects(projects: PublicDesignerProject[], sort: SortOption) {
  const sorted = [...projects];

  switch (sort) {
    case 'Newest':
      return sorted.sort((a, b) => Number(b.year) - Number(a.year));
    case 'Most viewed':
      return sorted.sort((a, b) => b.viewCount - a.viewCount);
    case 'Top rated':
      return sorted.sort((a, b) => b.rating - a.rating);
    case 'Largest':
      return sorted.sort((a, b) => b.areaSqFt - a.areaSqFt);
    case 'Featured':
      return sorted;
  }
}

export function PublicProjectGallery({ projects }: { projects: PublicDesignerProject[] }) {
  const [sort, setSort] = useState<SortOption>('Featured');
  const [filter, setFilter] = useState<FilterOption>('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filteredProjects = useMemo(() => {
    const matchingProjects =
      filter === 'All'
        ? projects
        : projects.filter((project) => project.propertyType.includes(filter));

    return sortProjects(matchingProjects, sort);
  }, [filter, projects, sort]);

  const visibleProjects = filteredProjects.slice(0, initialProjectCount);
  const additionalProjects = filteredProjects.slice(initialProjectCount);
  const visibleCount = showAll ? filteredProjects.length : visibleProjects.length;

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
            {sortOptions.map((option) => (
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
        </div>
      </div>

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

      <div
        data-testid="visible-projects"
        className="mt-8 grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visibleProjects.map((project) => (
          <PublicProjectCard key={project.id} project={project} />
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
              <PublicProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      </div>

      {additionalProjects.length > 0 ? (
        <div className="mt-12 flex justify-center">
          <Button
            type="button"
            variant="outline"
            className="h-11 cursor-pointer gap-1 px-5 shadow-sm"
            aria-expanded={showAll}
            onClick={() => setShowAll((visible) => !visible)}
          >
            {showAll ? 'Show fewer projects' : 'View all projects'}
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
