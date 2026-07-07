import { Fragment } from 'react';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard } from '@/components/try-filter-card';
import { mockProjects } from '@/lib/mock-projects';

// CSS columns fill top-to-bottom per column, so this index lands the CTA mid-grid like the Figma mock.
const TRY_FILTER_INDEX = 13;

/** Masonry project grid shared by both home states, with the "Try a filter" CTA slotted in. */
export function ProjectFeed() {
  return (
    <div className="columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {mockProjects.map((project, index) => (
        <Fragment key={project.id}>
          {index === TRY_FILTER_INDEX && <TryFilterCard />}
          <ShowcaseCard project={project} />
        </Fragment>
      ))}
    </div>
  );
}
