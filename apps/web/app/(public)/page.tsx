import type { FeedProject } from '@repo/contracts';
import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { ShowcaseCard } from '@/components/showcase-card';

const filters = [
  'Affordable modular kitchens',
  'Modern 2BHK interiors',
  'Scandinavian-style apartments',
  'Cozy bedroom ideas',
  'warm living room ideas',
  'Industrial loft apartments',
  '3BHK homes under ₹15L',
  'Walnut & cane interiors',
];

export default async function HomePage() {
  let projects: FeedProject[] = [];

  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8008';
    const res = await fetch(`${baseUrl}/api/projects/feed?limit=30`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      projects = data.projects ?? [];
    } else {
      console.error('[HomePage] feed response not ok:', res.status);
    }
  } catch (err) {
    console.error('[HomePage] feed fetch error:', err);
  }

  return (
    <>
      <TrustStrip />
      <HomeHero />

      <section className="mx-auto w-full max-w-[1512px] px-6 py-12 lg:px-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Trending projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hand-picked by our editors this week</p>
          </div>
          <a href="/" className="shrink-0 text-sm font-medium text-primary hover:underline">
            See all projects →
          </a>
        </div>

        <div className="mt-6 flex items-center gap-4 overflow-x-auto pb-1">
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#ede9e1] px-3.5 py-2 text-xs font-medium text-[#52525b] transition-colors hover:bg-accent"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
            </svg>
            Filters
          </button>
          <span className="h-[22px] w-px shrink-0 bg-[#ede9e1]" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="shrink-0 rounded-full border border-primary bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground"
            >
              All
            </button>
            {filters.map((filter) => (
              <button
                key={filter}
                type="button"
                className="shrink-0 whitespace-nowrap rounded-full border border-[#ede9e1] px-3.5 py-1.5 text-xs font-medium text-[#52525b] transition-colors hover:bg-accent hover:text-foreground"
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {projects.length > 0 ? (
          <div className="mt-8 columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
            {projects.map((project) => (
              <ShowcaseCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">
              No projects yet — check back soon.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
