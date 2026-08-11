import type { FeedProject } from '@repo/contracts';
import { feedProjectsResponseSchema } from '@repo/contracts';
import type { TaxonomyTerm } from '@repo/contracts';
import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import { DiscoveryFeedSection } from '@/components/discovery-feed-section';
import type { FilterChip } from '@/components/feed-filters';
import { getServerSession } from '@/lib/auth-guard';
import { api } from '@/lib/api';

const FEED_PAGE_SIZE = 24;

/** Fetches the public feed via the typed hc client. */
async function fetchFeedProjects(): Promise<{ projects: FeedProject[]; hasMore: boolean }> {
  try {
    const response = await api.api.projects.feed.$get({
      query: { limit: String(FEED_PAGE_SIZE) },
    });
    if (!response.ok) {
      console.error('[HomePage] feed response not ok:', response.status);
      return { projects: [], hasMore: false };
    }
    const payload = await response.json();
    const parsed = feedProjectsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      console.error('[HomePage] feed parse error:', parsed.error.message);
      return { projects: [], hasMore: false };
    }
    return { projects: parsed.data.projects, hasMore: parsed.data.hasMore };
  } catch (err) {
    console.error('[HomePage] feed fetch error:', err);
    return { projects: [], hasMore: false };
  }
}

/** Load popular taxonomy terms for the filter chips. */
async function fetchFilterChips(): Promise<{ filterChips: FilterChip[]; budgetChips: FilterChip[] }> {
  try {
    const [cityRes, bhkRes, budgetRes] = await Promise.all([
      api.api.taxonomy.terms.$get({ query: { kind: 'city' } }),
      api.api.taxonomy.terms.$get({ query: { kind: 'bhk' } }),
      api.api.taxonomy.terms.$get({ query: { kind: 'budget_band' } }),
    ]);

    const filterChips: FilterChip[] = [];
    const budgetChips: FilterChip[] = [];

    if (cityRes.ok) {
      const data = (await cityRes.json()) as { terms: TaxonomyTerm[] };
      for (const term of data.terms.slice(0, 4)) {
        filterChips.push({ slug: term.slug, label: term.label, kind: 'citySlug' });
      }
    }
    if (bhkRes.ok) {
      const data = (await bhkRes.json()) as { terms: TaxonomyTerm[] };
      for (const term of data.terms.slice(0, 3)) {
        filterChips.push({ slug: term.slug, label: term.label, kind: 'bhkSlug' });
      }
    }
    if (budgetRes.ok) {
      const data = (await budgetRes.json()) as { terms: TaxonomyTerm[] };
      for (const term of data.terms) {
        budgetChips.push({ slug: term.slug, label: term.label, kind: 'budgetBandSlug' });
      }
      // Add first 3 budget bands to the main filter chips too
      for (const term of data.terms.slice(0, 3)) {
        filterChips.push({ slug: term.slug, label: term.label, kind: 'budgetBandSlug' });
      }
    }

    return { filterChips, budgetChips };
  } catch {
    return { filterChips: [], budgetChips: [] };
  }
}

/**
 * Landing page with two states (Figma "HOME [Logged out]" / "HOME [Logged in]"):
 * - Logged out: trust banner + hero + "Trending projects" feed.
 * - Logged in: prominent search bar straight into the filtered feed.
 */
export default async function HomePage() {
  const [session, feed, taxonomy] = await Promise.all([
    getServerSession(),
    fetchFeedProjects(),
    fetchFilterChips(),
  ]);

  if (session) {
    return (
      <div className="bg-background">
        <section className="w-full px-5 py-6 sm:px-6">
          <h1 className="sr-only">Explore home projects</h1>
          <HomeSearchBar />
          <div className="mt-5">
            <DiscoveryFeedSection
              initialProjects={feed.projects}
              initialHasMore={feed.hasMore}
              filterChips={taxonomy.filterChips}
              budgetChips={taxonomy.budgetChips}
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <TrustStrip />
      <HomeHero />

      <div className="bg-home-hero-gradient-to">
        <section className="w-full px-5 py-5 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-medium tracking-tight">
                Trending projects
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                Hand-picked by our editors this week
              </p>
            </div>
          </div>

          <div className="mt-4">
            <DiscoveryFeedSection
              initialProjects={feed.projects}
              initialHasMore={feed.hasMore}
              filterChips={taxonomy.filterChips}
              budgetChips={taxonomy.budgetChips}
            />
          </div>
        </section>
      </div>
    </>
  );
}
