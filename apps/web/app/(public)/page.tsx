import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import { FeedFilters } from '@/components/feed-filters';
import { ProjectFeed } from '@/components/project-feed';
import { getServerSession } from '@/lib/auth-guard';

/**
 * Landing page with two states (Figma "HOME [Logged out]" / "HOME [Logged in]"):
 * - Logged out: trust banner + hero + "Trending projects" feed.
 * - Logged in: prominent search bar straight into the filtered feed.
 */
export default async function HomePage() {
  const session = await getServerSession();

  if (session) {
    return (
      <div className="bg-gradient-to-t from-[#e8f0eb] to-[#fafaf8]">
        <section className="mx-auto w-full max-w-[1512px] px-6 py-6 lg:px-10">
          <HomeSearchBar />
          <div className="mt-5">
            <FeedFilters />
          </div>
          <div className="mt-6">
            <ProjectFeed />
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <TrustStrip />
      <HomeHero />

      <div className="bg-gradient-to-t from-[#e8f0eb] to-[#fafaf8]">
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

          <div className="mt-6">
            <FeedFilters />
          </div>

          <div className="mt-8">
            <ProjectFeed />
          </div>
        </section>
      </div>
    </>
  );
}
