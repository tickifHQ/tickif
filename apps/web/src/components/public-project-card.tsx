import Image from 'next/image';
import type { PublicDesignerProject } from '@/lib/public-designer-profile-fixture';

/**
 * Project summary used by public designer profiles.
 *
 * This stays separate from the discovery `ShowcaseCard`, whose overlay controls
 * and masonry behavior do not match the profile portfolio treatment.
 */
export function PublicProjectCard({ project }: { project: PublicDesignerProject }) {
  return (
    <article>
      <div className="relative aspect-4/5 overflow-hidden rounded-sm bg-muted">
        <Image
          src={project.imageSrc}
          alt={`${project.title} interior`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 hover:scale-105"
        />
        <span className="absolute top-3 left-3 rounded-sm bg-foreground/70 px-2 py-1 font-mono text-xs font-semibold tracking-wide text-background">
          {project.year}
        </span>
      </div>
      <div className="px-0.5 pt-2">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          {project.propertyType}
        </p>
        <h3 className="mt-1 text-lg font-medium">{project.title}</h3>
        <div className="mt-1 flex items-start justify-between gap-4 text-sm text-muted-foreground">
          <p>{project.location}</p>
          <p className="shrink-0 text-right">{project.budget}</p>
        </div>
      </div>
    </article>
  );
}
