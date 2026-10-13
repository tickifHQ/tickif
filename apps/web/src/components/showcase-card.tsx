'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@repo/ui/components/badge';
import { DesignerLogoAvatar } from '@/components/designer-logo-avatar';
import { InitialsAvatar } from '@/components/initials-avatar';
import { cn } from '@repo/ui/lib/utils';
import { typography } from '@repo/ui/lib/typography';
import type { FeedProject } from '@repo/contracts';
import { ProjectActions } from '@/components/project-actions';
import { formatCompactBudgetLabel } from '../lib/format-budget-label';
import { BadgeCheck } from 'lucide-react';

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
  presentation?: 'default' | 'landing' | 'visitor';
}) {
  const compact = presentation !== 'default';
  const { imageWidth, imageHeight } = project;
  const hasImageDimensions =
    imageWidth !== null && imageWidth > 0 && imageHeight !== null && imageHeight > 0;
  const placeholderWidth = hasImageDimensions ? imageWidth : FALLBACK_WIDTH;
  const placeholderHeight = hasImageDimensions ? imageHeight : FALLBACK_HEIGHT;
  const href = project.coverImageId ? `/image/${project.coverImageId}` : `/projects/${project.id}`;
  const location = [project.locality, project.city].filter(Boolean).join(', ') || null;
  const budgetLabel = project.budget?.trim()
    ? formatCompactBudgetLabel(project.budget.trim())
    : null;

  return (
    <article
      className={cn(
        'group @container relative break-inside-avoid',
        compact ? 'mb-6' : 'mb-4 overflow-hidden rounded-xl bg-muted',
      )}
    >
      <Link href={href} className="block">
        <div
          className={
            presentation === 'visitor'
              ? 'relative aspect-4/5 overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-border'
              : presentation === 'landing'
                ? 'relative h-[240px] overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-border sm:h-[285px]'
                : ''
          }
        >
          {presentation === 'visitor' ? (
            <VisitorCover
              key={project.coverImageUrl}
              project={project}
              priority={priority}
              budgetLabel={budgetLabel}
            />
          ) : project.coverImageUrl ? (
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

          {budgetLabel && presentation !== 'visitor' ? (
            <span
              className={
                presentation === 'landing'
                  ? cn(
                      typography.monoXs,
                      'absolute bottom-2.5 left-2.5 rounded-full bg-card/95 px-2 py-1 text-foreground',
                    )
                  : 'absolute top-3 left-3 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium leading-[1.1] text-foreground transition-opacity sm:top-auto sm:bottom-3 sm:opacity-100 sm:group-hover:opacity-0'
              }
            >
              {budgetLabel}
            </span>
          ) : null}
        </div>
        {compact ? (
          <div className="mt-2 space-y-1 px-0.5">
            <h3
              className={cn(
                typography.labelMd,
                'truncate',
                presentation === 'landing' && 'text-xs @min-[14rem]:text-sm',
              )}
            >
              {project.title}
            </h3>
            <div
              className={cn(
                typography.body2xs,
                'flex min-w-0 items-center gap-1.5 text-muted-foreground',
              )}
            >
              {presentation === 'visitor' ? (
                <>
                  <DesignerLogoAvatar
                    logoUrl={project.studioLogoUrl}
                    alt=""
                    sizePx={18}
                    className="size-4.5"
                    fallback={
                      <InitialsAvatar
                        seed={project.studio}
                        fallbackSeed="Studio"
                        alt=""
                        size={18}
                      />
                    }
                  />
                  <span className="truncate">{project.studio}</span>
                  {project.studioIsVerified === true ? (
                    <BadgeCheck
                      role="img"
                      aria-label="Verified studio"
                      className="size-3.5 shrink-0 fill-primary text-primary-foreground"
                    />
                  ) : null}
                </>
              ) : null}
              {location ? (
                <span className="truncate text-muted-foreground">
                  {presentation === 'visitor' ? `· ${project.locality || project.city}` : location}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-foreground/80 p-3 opacity-100 transition-opacity @min-[14rem]:p-4 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
      {compact ? (
        <div
          className={cn(
            'absolute right-2.5 top-2.5',
            presentation === 'visitor' && 'pointer-events-none',
            presentation !== 'visitor' &&
              'opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
          )}
        >
          <ProjectActions
            projectId={project.id}
            loginHref={`/login?callbackURL=${encodeURIComponent(href)}`}
            canonicalUrl={href}
            presentation={presentation === 'visitor' ? 'visitor-save' : 'save'}
          />
        </div>
      ) : null}
    </article>
  );
}

function VisitorCover({
  project,
  priority,
  budgetLabel,
}: {
  project: FeedProject;
  priority: boolean;
  budgetLabel: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!project.coverImageUrl && !failed;
  return (
    <>
      {!showImage ? (
        <div
          role="img"
          aria-label={`${project.title} image unavailable`}
          className="grid size-full place-items-center bg-muted p-4 text-center text-xs text-muted-foreground"
        >
          Image coming soon
        </div>
      ) : (
        <img
          src={project.coverImageUrl ?? undefined}
          alt={project.title}
          width={project.imageWidth || FALLBACK_WIDTH}
          height={project.imageHeight || FALLBACK_HEIGHT}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          draggable={false}
          className="h-full w-full select-none object-cover"
          onError={() => setFailed(true)}
          onContextMenu={(event) => event.preventDefault()}
        />
      )}
      <div
        data-slot="project-media-footer"
        className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-end justify-between gap-x-2 gap-y-1"
      >
        {budgetLabel ? (
          <Badge
            variant="project-budget"
            size="media"
            title={budgetLabel}
            className="max-w-full truncate"
          >
            {budgetLabel}
          </Badge>
        ) : null}
        {showImage ? (
          <span
            aria-hidden="true"
            data-slot="project-watermark"
            className={cn(
              typography.monoXs,
              'pointer-events-none ml-auto select-none text-project-watermark opacity-[var(--project-watermark-opacity)] [text-shadow:var(--project-watermark-shadow)]',
            )}
          >
            TICKIF
          </span>
        ) : null}
      </div>
    </>
  );
}
