'use client';

import Link from 'next/link';
import type { FeedProject } from '@repo/contracts';
import { Avatar, AvatarFallback } from '@repo/ui/components/avatar';
import { ProjectActions } from '@/components/project-actions';
import { studioInitials } from '@/lib/public-portfolio-view';
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
  presentation = 'default',
}: {
  project: FeedProject;
  priority?: boolean;
  presentation?: 'default' | 'landing';
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
    <article
      className={`group @container relative break-inside-avoid ${presentation === 'landing' ? 'mb-6' : 'mb-4 overflow-hidden rounded-xl bg-muted'}`}
    >
      <Link href={href} className="block">
        <div
          className={
            presentation === 'landing'
              ? 'relative h-[240px] overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-border sm:h-[285px]'
              : ''
          }
        >
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
              className={
                presentation === 'landing'
                  ? 'landing-photo h-full w-full select-none object-cover'
                  : 'h-auto w-full select-none object-cover'
              }
              style={
                presentation === 'landing' || hasImageDimensions
                  ? undefined
                  : { aspectRatio: `${FALLBACK_WIDTH} / ${FALLBACK_HEIGHT}` }
              }
            />
          ) : (
            <div
              role="img"
              aria-label={`${project.title} image unavailable`}
              className="grid h-full w-full place-items-center bg-muted text-xs text-muted-foreground"
              style={
                presentation === 'landing'
                  ? undefined
                  : { aspectRatio: `${placeholderWidth} / ${placeholderHeight}` }
              }
            >
              Image coming soon
            </div>
          )}

          {budgetLabel ? (
            <span
              className={
                presentation === 'landing'
                  ? 'absolute bottom-2.5 left-2.5 rounded-full bg-card/95 px-2 py-1 font-mono text-[10px] leading-3 text-foreground'
                  : 'absolute top-3 left-3 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium leading-[1.1] text-foreground transition-opacity sm:top-auto sm:bottom-3 sm:opacity-100 sm:group-hover:opacity-0'
              }
            >
              {budgetLabel}
            </span>
          ) : null}
        </div>
        {presentation === 'landing' ? (
          <div className="mt-2 space-y-1 px-0.5">
            {project.tags.length > 0 ? (
              <p className="truncate font-mono text-[10px] uppercase tracking-wider text-primary">
                {project.tags.join(' · ')}
              </p>
            ) : null}
            <h3 className="truncate text-sm font-medium leading-[18px]">{project.title}</h3>
            <div className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
              {project.studio ? (
                <>
                  <Avatar aria-hidden className="size-[18px] border border-card">
                    <AvatarFallback className="bg-secondary text-[9px] text-primary">
                      {studioInitials(project.studio)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="shrink-0 max-w-[45%] truncate">{project.studio}</span>
                </>
              ) : null}
              {location ? (
                <span className="truncate text-foreground-subtle">
                  {project.studio ? '· ' : ''}
                  {location}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
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
        )}
      </Link>
      {presentation === 'landing' ? (
        <div className="absolute right-2.5 top-2.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <ProjectActions
            projectId={project.id}
            loginHref={`/login?callbackURL=${encodeURIComponent(href)}`}
            canonicalUrl={href}
            presentation="save"
          />
        </div>
      ) : null}
    </article>
  );
}
