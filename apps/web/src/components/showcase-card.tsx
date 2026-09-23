'use client';

import Link from 'next/link';
import type { FeedProject } from '@repo/contracts';
import { formatCompactBudgetLabel } from '../lib/format-budget-label';

const FALLBACK_WIDTH = 480;
const FALLBACK_HEIGHT = 600;

/**
 * Discovery and the image detail feed both hand us the canonical public project
 * card (`discoveryCardSchema` is an alias of `feedProjectSchema`), so there is a
 * single shape to render.
 */
export function ShowcaseCard({
  project,
  priority = false,
}: {
  project: FeedProject;
  priority?: boolean;
}) {
  const { imageWidth, imageHeight } = project;
  const hasImageDimensions =
    imageWidth !== null && imageWidth > 0 && imageHeight !== null && imageHeight > 0;
  const placeholderWidth = hasImageDimensions ? imageWidth : FALLBACK_WIDTH;
  const placeholderHeight = hasImageDimensions ? imageHeight : FALLBACK_HEIGHT;
  const href = project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;
  const budgetLabel = project.budget ? formatCompactBudgetLabel(project.budget) : null;

  return (
    <article className="group @container relative mb-4 break-inside-avoid overflow-hidden rounded-xl bg-muted">
      <Link href={href} className="block">
        {project.coverImageUrl ? (
          <img
            src={project.coverImageUrl}
            alt={project.title}
            width={placeholderWidth}
            height={placeholderHeight}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
            className="h-auto w-full select-none object-cover"
            style={
              hasImageDimensions
                ? undefined
                : { aspectRatio: `${FALLBACK_WIDTH} / ${FALLBACK_HEIGHT}` }
            }
          />
        ) : (
          <div
            role="img"
            aria-label={`${project.title} image unavailable`}
            className="grid w-full place-items-center bg-muted text-xs text-muted-foreground"
            style={{ aspectRatio: `${placeholderWidth} / ${placeholderHeight}` }}
          >
            Image coming soon
          </div>
        )}

        {budgetLabel ? (
          <span className="absolute bottom-3 left-3 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium leading-[1.1] text-foreground transition-opacity group-hover:opacity-0 sm:opacity-100">
            {budgetLabel}
          </span>
        ) : null}

        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-foreground/80 p-3 opacity-100 transition-opacity @min-[14rem]:p-4 sm:opacity-0 sm:group-hover:opacity-100">
          <h3 className="truncate font-display text-xs leading-tight tracking-tight text-background @min-[14rem]:text-sm">
            {project.title}
          </h3>
          {location ? (
            <div className="mt-0.5 flex min-w-0 items-center text-2xs text-background/90 @min-[14rem]:text-xs">
              <span className="truncate">{location}</span>
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
