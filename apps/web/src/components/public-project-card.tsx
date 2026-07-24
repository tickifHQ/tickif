import Image from 'next/image';
import Link from 'next/link';
import type { DesignerProjectCard } from '@repo/contracts';

/**
 * Project summary used by public designer profiles.
 *
 * This stays separate from the discovery `ShowcaseCard`, whose overlay controls
 * and masonry behavior do not match the profile portfolio treatment.
 */
export function PublicProjectCard({
  project,
  studioName,
}: {
  project: DesignerProjectCard;
  studioName: string;
}) {
  const location = [project.locality, project.city]
    .filter((part): part is string => !!part)
    .join(', ');

  return (
    <article>
      <Link href={`/projects/${project.id}`} className="group block">
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
            <span className="absolute top-3 left-3 rounded-sm bg-foreground/70 px-2 py-1 font-mono text-xs font-semibold tracking-wide text-background">
              {project.completionYear}
            </span>
          ) : null}
        </div>
        <div className="px-0.5 pt-2">
          {project.propertyType ? (
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              {project.propertyType}
            </p>
          ) : null}
          <h3 className="mt-1 text-lg font-medium">{project.title}</h3>
          <div className="mt-1 flex items-start justify-between gap-4 text-sm text-muted-foreground">
            {location ? <p>{location}</p> : <span />}
            {project.budget ? <p className="shrink-0 text-right">{project.budget}</p> : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
