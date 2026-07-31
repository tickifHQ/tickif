import type { FeedProject } from '@repo/contracts';
import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import { FeedFilters } from '@/components/feed-filters';
import { ProjectFeed } from '@/components/project-feed';
import { getServerSession } from '@/lib/auth-guard';
import { env } from '@/env';

/** Fetches the public feed; the landing page renders its empty state on any failure. */
async function fetchFeedProjects(): Promise<FeedProject[]> {
  try {
    const baseUrl = env.NEXT_PUBLIC_API_URL;
    const res = await fetch(`${baseUrl}/api/projects/feed?limit=30`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[HomePage] feed response not ok:', res.status);
      return [];
    }
    const data = await res.json();
    return data.projects ?? [];
  } catch (err) {
    console.error('[HomePage] feed fetch error:', err);
    return [];
  }
}

/**
 * Landing page with two states (Figma "HOME [Logged out]" / "HOME [Logged in]"):
 * - Logged out: trust banner + hero + "Trending projects" feed.
 * - Logged in: prominent search bar straight into the filtered feed.
 */
export default async function HomePage() {
  const [session, projects] = await Promise.all([getServerSession(), fetchFeedProjects()]);

  if (session) {
    return (
      <div className="bg-background">
        <section className="w-full px-5 py-6 sm:px-6">
          <h1 className="sr-only">Explore home projects</h1>
          <HomeSearchBar />
          <div className="mt-5">
            <FeedFilters />
          </div>
          <div className="mt-4">
            <ProjectFeed projects={projects} />
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <TrustStrip />
      <HomeHero />

      <div className="bg-background">
        <section className="w-full px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-medium tracking-tight">Trending projects</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Hand-picked by our editors this week
              </p>
            </div>
            <a href="/" className="shrink-0 pt-1 text-xs font-medium text-primary hover:underline">
              See all projects →
            </a>
          </div>

          <div className="mt-4">
            <FeedFilters />
          </div>

          <div className="mt-3">
            <ProjectFeed projects={projects} />
          </div>
        </section>
      </div>
    </>
  );
}
