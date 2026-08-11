'use client';

import Link from 'next/link';
import type { FeedProject } from '@repo/contracts';

const FALLBACK_WIDTH = 480;
const FALLBACK_HEIGHT = 600;

export function ShowcaseCard({ project }: { project: FeedProject }) {
  const width = project.imageWidth ?? FALLBACK_WIDTH;
  const height = project.imageHeight ?? FALLBACK_HEIGHT;
  const imageUrl = project.coverImageUrl;
  const href = project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;

  return (
    <Link
      href={href}
      className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-xl bg-muted"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={project.title}
          loading="lazy"
          className="w-full object-cover"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center bg-muted"
          style={{ aspectRatio: `${FALLBACK_WIDTH} / ${FALLBACK_HEIGHT}` }}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        </div>
      )}

      {project.budget && (
        <span className="absolute bottom-3 left-3 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[11px] font-medium text-foreground shadow-sm transition-opacity group-hover:opacity-0 sm:opacity-100">
          {project.budget}
        </span>
      )}

      <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Share this project"
          className="grid size-8 place-items-center rounded-full bg-background/95 text-foreground shadow-md backdrop-blur"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = `${window.location.origin}${href}`;
            if (navigator.share) {
              navigator.share({ title: project.title, url }).catch(() => {});
            } else {
              navigator.clipboard.writeText(url).catch(() => {});
            }
          }}
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

      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-foreground/80 p-[18px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <h3 className="font-display text-xl leading-tight tracking-tight text-background">
          {project.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-background/90">
          <span className="whitespace-nowrap">{project.studio}</span>
          {location && (
            <>
              <span className="text-background/50">·</span>
              <span className="whitespace-nowrap">{location}</span>
            </>
          )}
          <span className="whitespace-nowrap">
            <span className="text-background/50">·</span>{' '}
            <span aria-hidden className="text-primary">
              ★
            </span>{' '}
            {project.rating.toFixed(1)}
          </span>
        </div>
        {project.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background/20 px-2 py-[3px] text-[10.5px] font-medium tracking-[0.21px] text-background backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
