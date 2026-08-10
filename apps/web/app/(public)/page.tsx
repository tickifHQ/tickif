import { listTaxonomyResponseSchema, type FeedProject } from '@repo/contracts';
import { api } from '@/lib/api';
import { HomeHero } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import {
  FeedFilters,
  type FeedFacetDistribution,
  type FeedFacetOptions,
} from '@/components/feed-filters';
import { ProjectFeed } from '@/components/project-feed';
import { getServerSession } from '@/lib/auth-guard';
import {
  FEED_FACET_DEFINITIONS,
  parseFeedParams,
  toDiscoveryFeedFilters,
  toFeedProjectsFilters,
  type FeedFilterState,
} from '@/lib/feed-params';

const TAXONOMY_REVALIDATE_SECONDS = 60 * 60 * 24 * 7;

async function fetchTaxonomyOptions(): Promise<FeedFacetOptions> {
  const entries = await Promise.all(
    FEED_FACET_DEFINITIONS.map(async (facet) => {
      try {
        const response = await api.api.taxonomy.terms.$get(
          { query: { kind: facet.kind } },
          { init: { next: { revalidate: TAXONOMY_REVALIDATE_SECONDS } } },
        );
        if (!response.ok) return [facet.key, []] as const;
        const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
        if (!parsed.success) return [facet.key, []] as const;
        return [
          facet.key,
          parsed.data.terms.map((term) => ({ slug: term.slug, label: term.label })),
        ] as const;
      } catch {
        return [facet.key, []] as const;
      }
    }),
  );

  return Object.fromEntries(entries) as FeedFacetOptions;
}

/** Scope counts to the active filters so cross-facet choices match the rendered feed. */
async function fetchFacetDistribution(filters: FeedFilterState): Promise<FeedFacetDistribution> {
  try {
    const response = await api.api.discovery.feed.$get({
      query: { limit: 1, ...toDiscoveryFeedFilters(filters) },
    });
    if (!response.ok) return {};
    const data = await response.json();
    return data.facetDistribution ?? {};
  } catch {
    return {};
  }
}

/** Fetches the public feed; the landing page renders its empty state on any failure. */
async function fetchFeedProjects(filters: FeedFilterState): Promise<FeedProject[]> {
  try {
    const res = await api.api.projects.feed.$get(
      {
        query: {
          limit: 30,
          ...toFeedProjectsFilters(filters),
        },
      },
      {
        init: { cache: 'no-store' },
      },
    );
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
type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams = Promise.resolve({}) }: HomePageProps = {}) {
  const params = await searchParams;
  const initialFilters: FeedFilterState = parseFeedParams(params);
  const [session, projects, taxonomyOptions, facetDistribution] = await Promise.all([
    getServerSession(),
    fetchFeedProjects(initialFilters),
    fetchTaxonomyOptions(),
    fetchFacetDistribution(initialFilters),
  ]);

  if (session) {
    return (
      <div className="bg-background">
        <section className="w-full px-5 py-6 sm:px-6">
          <h1 className="sr-only">Explore home projects</h1>
          <HomeSearchBar />
          <div className="mt-5">
            <FeedFilters options={taxonomyOptions} facetDistribution={facetDistribution} />
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
            <a
              href="/"
              className="shrink-0 pb-0.5 text-sm font-medium text-primary hover:underline"
            >
              See all projects →
            </a>
          </div>

          <div className="mt-4">
            <FeedFilters options={taxonomyOptions} facetDistribution={facetDistribution} />
          </div>

          <div className="mt-3">
            <ProjectFeed projects={projects} />
          </div>
        </section>
      </div>
    </>
  );
}
