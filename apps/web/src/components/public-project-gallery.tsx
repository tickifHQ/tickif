'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { DesignerProjectCard, DesignerProjectsResponse } from '@repo/contracts';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
} from '@repo/ui/components/pagination';
import { PublicProjectCard } from '@/components/public-project-card';
import { fetchDesignerProjects } from '@/lib/public-portfolio-api';

const INITIAL_VISIBLE_COUNT = 6;

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
  fallbackBudgetLabel = null,
  emptyMessage,
}: {
  profileId: string;
  initialPage: DesignerProjectsResponse;
  studioName: string;
  fallbackBudgetLabel?: string | null;
  emptyMessage: string;
}) {
  const [projects, setProjects] = useState<DesignerProjectCard[]>(initialPage.projects);
  const [page, setPage] = useState(initialPage.page);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [displayPage, setDisplayPage] = useState(0);

  const offset = displayPage * INITIAL_VISIBLE_COUNT;
  const visibleProjects = projects.slice(offset, offset + INITIAL_VISIBLE_COUNT);
  const canAdvance = offset + INITIAL_VISIBLE_COUNT < projects.length || hasMore;

  function handleNext() {
    if (offset + INITIAL_VISIBLE_COUNT < projects.length) {
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
        if (projects.length + next.projects.length > offset + INITIAL_VISIBLE_COUNT) {
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
      <div
        data-testid="visible-projects"
        className="mt-9 grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3"
      >
        {visibleProjects.map((project) => (
          <PublicProjectCard
            key={project.id}
            project={project}
            studioName={studioName}
            fallbackBudgetLabel={fallbackBudgetLabel}
          />
        ))}
      </div>

      {loadError ? (
        <p role="status" className="mt-6 text-center text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {projects.length > INITIAL_VISIBLE_COUNT || hasMore ? (
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
              { length: Math.max(1, Math.ceil(projects.length / INITIAL_VISIBLE_COUNT)) },
              (_, index) => index,
            )
              .filter(
                (index) =>
                  index === 0 ||
                  index === Math.ceil(projects.length / INITIAL_VISIBLE_COUNT) - 1 ||
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
