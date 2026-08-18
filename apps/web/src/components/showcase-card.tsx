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
  const { imageWidth, imageHeight, tags } = project;
  const hasImageDimensions =
    imageWidth !== null && imageWidth > 0 && imageHeight !== null && imageHeight > 0;
  const placeholderWidth = hasImageDimensions ? imageWidth : FALLBACK_WIDTH;
  const placeholderHeight = hasImageDimensions ? imageHeight : FALLBACK_HEIGHT;
  const href = project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;
  // Search-sourced cards have no aggregate rating, so 0 reviews means "no score yet".
  const rating = project.reviewCount > 0 ? project.rating.toFixed(1) : null;
  const budgetLabel = project.budget ? formatCompactBudgetLabel(project.budget) : null;

  return (
    <article className="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl bg-muted">
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

        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-foreground/80 p-[18px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <h3 className="font-display text-xl leading-tight tracking-tight text-background">
            {project.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-background/90">
            <span className="whitespace-nowrap">{project.studio}</span>
            {location ? (
              <>
                <span className="text-background/50">·</span>
                <span className="whitespace-nowrap">{location}</span>
              </>
            ) : null}
            {rating ? (
              <span className="whitespace-nowrap">
                <span className="text-background/50">·</span>{' '}
                <span aria-hidden className="text-primary">
                  ★
                </span>{' '}
                {rating}
              </span>
            ) : null}
          </div>
          {tags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-background/20 px-2 py-[3px] text-[10.5px] font-medium tracking-[0.21px] text-background backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Link>

      {/*
        Save/Share are still visual placeholders. Until they are wired up they stay
        out of the accessibility tree and out of the tab order (`inert`), so keyboard
        and screen-reader users are not offered controls that do nothing.
      */}
      <div
        inert
        aria-hidden
        className="absolute right-3 top-3 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <button
          type="button"
          aria-label="Save"
          className="grid size-8 place-items-center rounded-full bg-background/95 text-foreground shadow-md backdrop-blur"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.5 5.5c2 0 3.5 1.5 6.5 4.5 3-3 4.5-4.5 6.5-4.5C22 5.5 23.5 9 21.5 12.5 19 16.65 12 21 12 21Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Share"
          className="grid size-8 place-items-center rounded-full bg-background/95 text-foreground shadow-md backdrop-blur"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </div>
    </article>
  );
}
