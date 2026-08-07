import type { Metadata } from 'next';
import Link from 'next/link';
import { listTaxonomyResponseSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { HomeHero, type HomeShortcut } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import { FeedFilters, type FeedFacetOptions } from '@/components/feed-filters';
import { ProjectFeed } from '@/components/project-feed';
import type { FeedFilterSuggestion } from '@/components/try-filter-card';
import { getServerSession } from '@/lib/auth-guard';
import {
  FEED_FACET_DEFINITIONS,
  FEED_FILTER_KEYS,
  feedPageHref,
  parseFeedPage,
  parseFeedParams,
  parseFeedQuery,
  type FeedFilterState,
} from '@/lib/feed-params';
import {
  emptyHomeFeedPage,
  fetchHomeFeedPage,
  type HomeFeedPage,
  type HomeFeedRequest,
} from '@/lib/home-feed';

type HomeSearchParams = Record<string, string | string[] | undefined>;

type HomePageProps = {
  searchParams?: Promise<HomeSearchParams>;
};

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

async function fetchFeedSafely(request: HomeFeedRequest, page: number): Promise<HomeFeedPage> {
  try {
    return await fetchHomeFeedPage(request, page);
  } catch (error) {
    console.error('[HomePage] feed fetch failed', error);
    return emptyHomeFeedPage(page);
  }
}

function hasFilters(filters: FeedFilterState): boolean {
  return FEED_FILTER_KEYS.some((key) => filters[key].length > 0);
}

function homeShortcuts(options: FeedFacetOptions): HomeShortcut[] {
  const city = (options.city ?? []).slice(0, 4).map((option) => ({
    href: `/?city=${encodeURIComponent(option.slug)}`,
    label: `Homes in ${option.label}`,
  }));
  const room = (options.room ?? []).slice(0, 4).map((option) => ({
    href: `/?room=${encodeURIComponent(option.slug)}`,
    label: `${option.label} ideas`,
  }));
  const shortcuts: HomeShortcut[] = [];

  for (let index = 0; index < Math.max(city.length, room.length); index += 1) {
    const cityShortcut = city[index];
    const roomShortcut = room[index];
    if (cityShortcut) shortcuts.push(cityShortcut);
    if (roomShortcut) shortcuts.push(roomShortcut);
  }

  return shortcuts;
}

function budgetSuggestions(options: FeedFacetOptions): FeedFilterSuggestion[] {
  return (options.budgetBand ?? []).slice(0, 5).map((option) => ({
    href: `/?budgetBand=${encodeURIComponent(option.slug)}`,
    label: option.label,
  }));
}

function canonicalParams(params: HomeSearchParams, page: number): HomeSearchParams {
  const result: HomeSearchParams = {};
  const query = parseFeedQuery(params.q);
  if (query) result.q = query;

  const filters = parseFeedParams(params);
  for (const key of FEED_FILTER_KEYS) {
    if (filters[key].length > 0) result[key] = filters[key].join(',');
  }
  if (page > 1) result.page = String(page);

  return result;
}

export async function generateMetadata({
  searchParams = Promise.resolve({}),
}: HomePageProps = {}): Promise<Metadata> {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  return {
    alternates: {
      canonical: feedPageHref(canonicalParams(params, page), page),
    },
  };
}

/** Real-data homepage shared by logged-out discovery and the logged-in infinite feed. */
export default async function HomePage({ searchParams = Promise.resolve({}) }: HomePageProps = {}) {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  const query = parseFeedQuery(params.q);
  const filters = parseFeedParams(params);
  const request: HomeFeedRequest = { filters, query, sort: 'recent' };
  const isDefaultFeed = !query && !hasFilters(filters);

  const [session, taxonomyOptions, initialPage, featuredPage] = await Promise.all([
    getServerSession(),
    fetchTaxonomyOptions(),
    fetchFeedSafely(request, page),
    isDefaultFeed
      ? fetchFeedSafely({ filters, query: '', sort: 'featured' }, 1)
      : Promise.resolve(emptyHomeFeedPage(1)),
  ]);
  const filterSuggestions = budgetSuggestions(taxonomyOptions);

  const previousHref = page > 1 ? feedPageHref(canonicalParams(params, page - 1), page - 1) : null;
  const nextHref = initialPage.hasMore
    ? feedPageHref(canonicalParams(params, page + 1), page + 1)
    : null;

  if (session) {
    return (
      <div className="bg-background">
        {previousHref ? <link rel="prev" href={previousHref} /> : null}
        {nextHref ? <link rel="next" href={nextHref} /> : null}
        <section className="w-full px-5 py-6 sm:px-6">
          <h1 className="sr-only">Explore home projects</h1>
          <HomeSearchBar initialQuery={query} />
          <div className="mt-5">
            <FeedFilters
              options={taxonomyOptions}
              facetDistribution={initialPage.facetDistribution}
            />
          </div>
          <div className="mt-4">
            <ProjectFeed
              initialPage={initialPage}
              request={request}
              filterSuggestions={filterSuggestions}
            />
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      {previousHref ? <link rel="prev" href={previousHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
      <TrustStrip />
      <HomeHero shortcuts={homeShortcuts(taxonomyOptions)} initialQuery={query} />

      <div className="bg-home-hero-gradient-to">
        {isDefaultFeed && featuredPage.items.length > 0 ? (
          <section className="w-full px-5 py-6 sm:px-6" aria-labelledby="featured-projects">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  id="featured-projects"
                  className="font-display text-3xl font-medium tracking-tight"
                >
                  Featured projects
                </h2>
                <p className="mt-1 text-base text-muted-foreground">
                  Standout spaces selected for the homepage
                </p>
              </div>
              <Link
                href="/"
                className="shrink-0 pb-0.5 text-sm font-medium text-primary hover:underline"
              >
                See all projects
              </Link>
            </div>
            <div className="mt-4">
              <ProjectFeed
                initialPage={{ ...featuredPage, hasMore: false }}
                request={{ filters, query: '', sort: 'featured' }}
                infinite={false}
                showTryFilter={false}
              />
            </div>
          </section>
        ) : null}

        <section className="w-full px-5 py-6 sm:px-6" aria-labelledby="project-results">
          <div>
            <h2 id="project-results" className="font-display text-3xl font-medium tracking-tight">
              {query ? `Results for “${query}”` : isDefaultFeed ? 'Recently published' : 'Projects'}
            </h2>
            <p className="mt-1 text-base text-muted-foreground">
              {query
                ? 'Projects matching your search and filters'
                : 'Browse real projects published by Tickif designers'}
            </p>
          </div>

          <div className="mt-4">
            <FeedFilters
              options={taxonomyOptions}
              facetDistribution={initialPage.facetDistribution}
            />
          </div>

          <div className="mt-3">
            <ProjectFeed
              initialPage={initialPage}
              request={request}
              filterSuggestions={filterSuggestions}
            />
          </div>
        </section>
      </div>
    </>
  );
}
