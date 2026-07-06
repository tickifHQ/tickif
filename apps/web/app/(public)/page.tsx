import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { ShowcaseCard } from '@/components/showcase-card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
  // Fetch published projects from the public feed API
  let projects: Array<{
    id: string;
    slug: string;
    title: string;
    studio: string;
    city: string | null;
    locality: string | null;
    rating: number;
    budget: string | null;
    tags: string[];
    coverImageUrl: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
  }> = [];

  try {
    const res = await fetch(`${API_URL}/api/projects/feed?limit=30`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      projects = data.projects ?? [];
    }
  } catch {
    // Fallback: empty feed if API is unavailable
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

        <div className="mt-8 columns-2 gap-4 md:columns-3 lg:columns-4 xl:columns-5">
          {projects.length > 0 ? (
            projects.map((project) => (
              <ShowcaseCard key={project.id} project={project} />
            ))
          ) : (
            <p className="col-span-full text-center text-sm text-muted-foreground">
              No projects yet — check back soon.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
