import Image from 'next/image';
import Link from 'next/link';
import type { DesignerProjectCard } from '@repo/contracts';
import { Badge } from '@repo/ui/components/badge';
import { ArrowUpRight, Bookmark, Star } from 'lucide-react';
import { formatCompactBudgetLabel } from '@/lib/format-budget-label';
import { ProjectViewCount } from '@/components/project-view-count';

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
  fallbackBudgetLabel = null,
}: {
  project: DesignerProjectCard;
  studioName: string;
  presentation?: 'portfolio' | 'recommendation';
  destination?: 'image' | 'project';
  showRating?: boolean;
  fallbackBudgetLabel?: string | null;
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
  const budget = project.budget ? formatCompactBudgetLabel(project.budget) : fallbackBudgetLabel;

  if (presentation === 'portfolio') {
    const portfolioMeta = [
      project.bhk ?? project.propertyType,
      project.locality ?? project.city,
      project.sizeSqft != null ? `${project.sizeSqft.toLocaleString('en-IN')} sq ft` : null,
      project.completionYear,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <article className="profile-project-card">
        <Link href={href} className="group block" aria-label={`View ${project.title}`}>
          <div className="profile-project-media">
            {project.coverImageUrl ? (
              <Image
                src={project.coverImageUrl}
                alt={`${project.title} by ${studioName}`}
                fill
                unoptimized
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            ) : null}
            {budget ? <span className="profile-project-budget">{budget}</span> : null}
            <span className="profile-project-save" aria-hidden="true">
              <Bookmark className="size-4" />
            </span>
            <span className="profile-project-caption">
              <span className="min-w-0">
                <h3 className="profile-project-title">{project.title}</h3>
                {portfolioMeta ? (
                  <span className="profile-project-meta">{portfolioMeta}</span>
                ) : null}
              </span>
              <span className="profile-project-go" aria-hidden="true">
                <ArrowUpRight className="size-4" />
              </span>
            </span>
          </div>
        </Link>
        <div className="mt-3 flex">
          <ProjectViewCount projectId={project.id} />
        </div>
      </article>
    );
  }

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
              className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
          ) : null}
          {project.completionYear ? (
            <Badge
              variant="inverse"
              shape="square"
              size="compact"
              textStyle="code"
              className="absolute left-3 top-3"
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
        <div className="px-0.5 pt-4">
          {metadata ? (
            <p
              className="font-mono text-2xs tracking-widest text-muted-foreground uppercase"
            >
              {metadata}
            </p>
          ) : null}
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="mt-1.5 text-lg leading-relaxed font-medium">
              {project.title}
            </h3>
          </div>
          <div className="mt-1 flex items-start justify-between gap-4 text-sm leading-none font-medium text-muted-foreground">
            {location ? <p>{location}</p> : <span />}
            {budget ? <p className="shrink-0 text-right">{budget}</p> : null}
          </div>
        </div>
      </Link>
      <div className="mt-3 flex">
        <ProjectViewCount projectId={project.id} />
      </div>
    </article>
  );
}
