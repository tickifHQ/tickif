import Image from 'next/image';
import Link from 'next/link';
import type { DesignerProjectCard } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { cn } from '@repo/ui/lib/utils';
import { Star } from 'lucide-react';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import { ProjectLikeButton } from '@/components/project-like-button';

/**
 * Project summary used by public designer profiles.
 *
 * This stays separate from the discovery `ShowcaseCard`, whose overlay controls
 * and masonry behavior do not match the profile portfolio treatment.
 */
export function PublicProjectCard({
  project,
  studioName,
  presentation = 'portfolio',
  destination = 'image',
  showRating = false,
}: {
  project: DesignerProjectCard;
  studioName: string;
  presentation?: 'portfolio' | 'recommendation';
  destination?: 'image' | 'project';
  showRating?: boolean;
}) {
  const location = [project.locality, project.city]
    .filter((part): part is string => !!part)
    .join(', ');
  const href =
    destination === 'image' && project.coverImageId
      ? `/image/${project.coverImageId}`
      : `/projects/${project.id}`;
  const hasRating = showRating && project.reviewCount > 0 && project.rating > 0;
  const metadata =
    presentation === 'recommendation'
      ? [project.bhk, project.theme].filter((value): value is string => Boolean(value)).join(' · ')
      : project.propertyType;
  const budget = project.budget ? formatCompactBudgetLabel(project.budget) : null;

  return (
    <article>
      <Link href={href} className="group block">
        <div className="relative aspect-4/5 overflow-hidden rounded-sm bg-muted">
          {project.coverImageUrl ? (
            <Image
              src={project.coverImageUrl}
              alt={`${project.title} by ${studioName}`}
              fill
              // Presigned storage URL — see the note in public-designer-profile.
              unoptimized
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}
          {project.completionYear ? (
            <Badge
              variant="inverse"
              shape="square"
              size={presentation === 'recommendation' ? 'compact' : 'default'}
              textStyle="code"
              className={cn(
                'absolute left-3 top-3',
                presentation === 'portfolio' && 'font-semibold',
              )}
            >
              {project.completionYear}
            </Badge>
          ) : null}
          {hasRating ? (
            <Badge
              variant="neutral"
              shape="square"
              size="compact"
              className="absolute right-3 top-3"
              aria-label={`${studioName} studio rating ${project.rating.toFixed(1)} out of 5`}
            >
              <span>Studio</span>
              <Star aria-hidden data-icon="inline-start" fill="currentColor" />
              {project.rating.toFixed(1)}
            </Badge>
          ) : null}
        </div>
        <div className={cn('px-0.5', presentation === 'recommendation' ? 'pt-4' : 'pt-2')}>
          {metadata ? (
            <p
              className={cn(
                'font-mono tracking-widest text-muted-foreground uppercase',
                presentation === 'recommendation' ? 'text-2xs' : 'text-xs',
              )}
            >
              {metadata}
            </p>
          ) : null}
          <h3
            className={cn(
              'text-lg font-medium',
              presentation === 'recommendation' ? 'mt-1.5 leading-relaxed' : 'mt-1',
            )}
          >
            {project.title}
          </h3>
          <div
            className={cn(
              'mt-1 flex items-start justify-between gap-4 text-sm text-muted-foreground',
              presentation === 'recommendation' && 'font-medium leading-none',
            )}
          >
            {location ? <p>{location}</p> : <span />}
            {budget ? <p className="shrink-0 text-right">{budget}</p> : null}
          </div>
        </div>
      </Link>
      <div className="mt-3">
        <ProjectLikeButton projectId={project.id} loginHref={`/login?callbackURL=${encodeURIComponent(href)}`} />
      </div>
    </article>
  );
}
