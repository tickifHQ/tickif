'use client';

import Link from 'next/link';
import type { DiscoveryCard, FeedProject } from '@repo/contracts';

const FALLBACK_WIDTH = 480;
const FALLBACK_HEIGHT = 600;

type ShowcaseProject = FeedProject | DiscoveryCard;

function isLegacyFeedProject(project: ShowcaseProject): project is FeedProject {
  return 'studio' in project;
}

export function ShowcaseCard({
  project,
  priority = false,
}: {
  project: ShowcaseProject;
  priority?: boolean;
}) {
  const isLegacy = isLegacyFeedProject(project);
  const width = (isLegacy ? project.imageWidth : project.coverImageWidth) ?? FALLBACK_WIDTH;
  const height = (isLegacy ? project.imageHeight : project.coverImageHeight) ?? FALLBACK_HEIGHT;
  const href =
    isLegacy && project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  const location = isLegacy
    ? [project.locality, project.city].filter(Boolean).join(', ') || null
    : project.city;
  const studio = isLegacy ? project.studio : project.designerName;
  const rating = isLegacy ? project.rating.toFixed(1) : project.ratingSnippet;
  const tags = isLegacy ? project.tags : [project.bhk].filter((tag): tag is string => !!tag);

  return (
    <article className="group relative mb-4 break-inside-avoid overflow-hidden rounded-xl bg-muted">
      <Link href={href} className="block">
        {project.coverImageUrl ? (
          <img
            src={project.coverImageUrl}
            alt={project.title}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
            className="w-full select-none object-cover"
            style={{ aspectRatio: `${width} / ${height}` }}
          />
        ) : (
          <div
            role="img"
            aria-label={`${project.title} image unavailable`}
            className="grid w-full place-items-center bg-muted text-xs text-muted-foreground"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            Image coming soon
          </div>
        )}

        {project.budget ? (
          <span className="absolute bottom-3 left-3 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium leading-[1.1] text-foreground transition-opacity group-hover:opacity-0 sm:opacity-100">
            {project.budget}
          </span>
        ) : null}

        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-foreground/80 p-[18px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <h3 className="font-display text-xl leading-tight tracking-tight text-background">
            {project.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-background/90">
            <span className="whitespace-nowrap">{studio}</span>
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

      <div className="absolute right-3 top-3 z-10 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
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
