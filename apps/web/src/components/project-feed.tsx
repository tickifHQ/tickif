import { Fragment } from 'react';
import { ShowcaseCard } from '@/components/showcase-card';
import { TryFilterCard } from '@/components/try-filter-card';
import { mockProjects, FEED_IMAGE_WIDTH } from '@/lib/mock-projects';
import type { FeedProject } from '@repo/contracts';

// CSS columns fill top-to-bottom per column, so this index lands the CTA mid-grid like the Figma mock.
const TRY_FILTER_INDEX = 13;

function toFeedProject(mock: (typeof mockProjects)[number]): FeedProject {
  return {
    id: mock.id,
    slug: mock.seed,
    title: mock.title,
    studio: mock.studio,
    city: mock.city,
    locality: null,
    rating: mock.rating,
    reviewCount: 0,
    budget: mock.budget,
    tags: [...mock.tags],
    coverImageUrl: null,
    imageWidth: FEED_IMAGE_WIDTH,
    imageHeight: mock.imageHeight,
  };
}

/** Masonry project grid shared by both home states, with the "Try a filter" CTA slotted in. */
export function ProjectFeed() {
  return (
    <div className="columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
      {mockProjects.map((project, index) => (
        <Fragment key={project.id}>
          {index === TRY_FILTER_INDEX && <TryFilterCard />}
          <ShowcaseCard project={toFeedProject(project)} />
        </Fragment>
      ))}
    </div>
  );
}
