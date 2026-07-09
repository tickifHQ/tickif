import type { FeedProject } from '@/lib/mock-projects';
import { feedImageUrl, FEED_IMAGE_WIDTH } from '@/lib/mock-projects';

export function ShowcaseCard({ project }: { project: FeedProject }) {
  return (
    <article className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-xl bg-[#e9e2d0]">
      <img
        src={feedImageUrl(project.seed, project.imageHeight)}
        alt={project.title}
        loading="lazy"
        className="w-full object-cover"
        style={{ aspectRatio: `${FEED_IMAGE_WIDTH} / ${project.imageHeight}` }}
      />

      <span className="absolute bottom-3 left-3 rounded-full bg-background/95 px-2.5 py-1 font-mono text-[11px] font-medium text-foreground shadow-sm transition-opacity group-hover:opacity-0 sm:opacity-100">
        {project.budget}
      </span>

      {project.sponsored && (
        <span className="absolute left-3 top-3 rounded bg-[#0f0c05]/55 px-2 py-[3px] font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-white">
          Sponsored
        </span>
      )}

      <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" aria-label="Save" className="grid size-8 place-items-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.5 5.5c2 0 3.5 1.5 6.5 4.5 3-3 4.5-4.5 6.5-4.5C22 5.5 23.5 9 21.5 12.5 19 16.65 12 21 12 21Z" />
          </svg>
        </button>
        <button type="button" aria-label="Share" className="grid size-8 place-items-center rounded-full bg-white/95 text-foreground shadow-md backdrop-blur">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
      </div>

      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-b from-transparent via-transparent to-[#0f0c05]/80 p-[18px] opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <h3 className="font-display text-xl leading-tight tracking-tight text-white">{project.title}</h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-white/90">
          <span className="whitespace-nowrap">{project.studio}</span>
          <span className="text-white/50">·</span>
          <span className="whitespace-nowrap">{project.city}</span>
          <span className="whitespace-nowrap">
            <span className="text-white/50">·</span> <span aria-hidden className="text-amber-300">★</span>{' '}
            {project.rating.toFixed(1)}
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/[0.18] px-2 py-[3px] text-[10.5px] font-medium tracking-[0.21px] text-white backdrop-blur-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
