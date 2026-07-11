import { Fragment } from 'react';
import type { FeedProject } from '@repo/contracts';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard } from '@/components/try-filter-card';

// CSS columns fill top-to-bottom per column, so this index lands the CTA mid-grid like the Figma mock.
const TRY_FILTER_INDEX = 13;

/** Masonry project grid shared by both home states, with the "Try a filter" CTA slotted in. */
export function ProjectFeed({ projects }: { projects: FeedProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">No projects yet — check back soon.</p>
      </div>
    );
  }

  return (
    <div className="columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {projects.map((project, index) => (
        <Fragment key={project.id}>
          {index === TRY_FILTER_INDEX && <TryFilterCard />}
          <ShowcaseCard project={project} />
        </Fragment>
      ))}
    </div>
  );
}
