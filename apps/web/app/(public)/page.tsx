import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listTaxonomyResponseSchema, PLATFORM_ROLE, platformRoleSchema } from '@repo/contracts';
import { api } from '@/lib/api';
import { HomeHero, type HomeShortcut } from '@/components/home-hero';
import { TrustStrip } from '@/components/trust-strip';
import { HomeSearchBar } from '@/components/home-search-bar';
import { FeedFilters, type FeedFacetOptions } from '@/components/feed-filters';
import { ProjectFeed } from '@/components/project-feed';
import { getServerSession } from '@/lib/auth-guard';
import {
  FEED_FACET_DEFINITIONS,
  FEED_FILTER_KEYS,
  parseFeedPage,
  parseFeedParams,
  parseFeedQuery,
  type FeedFilterState,
} from '@/lib/feed-params';
import {
  budgetSuggestions,
  canonicalFeedParams,
  feedPageLink,
  searchLabelMaps,
} from '@/lib/feed-page-helpers';
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
/** Anchor target for the logged-out "See all projects" link. */
const RECENT_FEED_SECTION_ID = 'recent-projects-feed';

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

async function fetchFeedSafely(
  request: HomeFeedRequest,
  page: number,
  options?: Parameters<typeof fetchHomeFeedPage>[2],
): Promise<HomeFeedPage> {
  try {
    return await fetchHomeFeedPage(request, page, options);
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

export async function generateMetadata({
  searchParams = Promise.resolve({}),
}: HomePageProps = {}): Promise<Metadata> {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  return {
    alternates: {
      canonical: feedPageLink(params, page),
    },
  };
}

/** Real-data homepage shared by logged-out discovery and the logged-in infinite feed. */
export default async function HomePage({ searchParams = Promise.resolve({}) }: HomePageProps = {}) {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  const query = parseFeedQuery(params.q);
  const filters = parseFeedParams(params);
  const baseRequest: HomeFeedRequest = { filters, query, sort: 'recent' };
  const isDefaultFeed = page === 1 && !query && !hasFilters(filters);

  const sessionPromise = getServerSession();
  const taxonomyOptionsPromise = fetchTaxonomyOptions();
  // One request per feed, always at the real page size: `hasMore` and the
  // rel=prev/next hints have to describe the 24-per-page scheme the links use.
  const initialPagePromise = query
    ? fetchFeedSafely(baseRequest, page, {
        searchLabels: taxonomyOptionsPromise.then(searchLabelMaps),
      })
    : fetchFeedSafely(baseRequest, page);
  const featuredPagePromise = isDefaultFeed
    ? sessionPromise.then((session) =>
        session
          ? emptyHomeFeedPage(1)
          : fetchFeedSafely({ filters, query: '', sort: 'featured' }, 1),
      )
    : Promise.resolve(emptyHomeFeedPage(1));
  const [session, taxonomyOptions, initialPage, featuredPage] = await Promise.all([
    sessionPromise,
    taxonomyOptionsPromise,
    initialPagePromise,
    featuredPagePromise,
  ]);
  const labelMaps = searchLabelMaps(taxonomyOptions);
  const request: HomeFeedRequest = {
    ...baseRequest,
    ...labelMaps,
  };
  const filterSuggestions = budgetSuggestions(taxonomyOptions, params);
  const paginationParams = canonicalFeedParams(params, 1);

  const previousHref = page > 1 ? feedPageLink(params, page - 1) : null;
  const nextHref = initialPage.hasMore ? feedPageLink(params, page + 1) : null;

  // Designers keep a dedicated personal home: visiting the public root sends
  // them to My Tickif instead of rendering the visitor homepage.
  if (session) {
    const parsedRole = platformRoleSchema.safeParse(session.user.role);
    if (parsedRole.success && parsedRole.data === PLATFORM_ROLE.DESIGNER) {
      redirect('/home');
    }
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
              paginationParams={paginationParams}
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
        {isDefaultFeed ? (
          <>
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
                {/* Jumps to the recent feed rendered below rather than back to this URL. */}
                <Link
                  href={`#${RECENT_FEED_SECTION_ID}`}
                  className="shrink-0 pb-0.5 text-sm font-medium text-primary hover:underline"
                >
                  See all projects
                </Link>
              </div>

              <div className="mt-4">
                <FeedFilters
                  options={taxonomyOptions}
                  facetDistribution={initialPage.facetDistribution}
                />
              </div>

              <div className="mt-3">
                <ProjectFeed
                  initialPage={{ ...featuredPage, hasMore: false }}
                  request={{ filters, query: '', sort: 'featured' }}
                  infinite={false}
                  filterSuggestions={filterSuggestions}
                />
              </div>
            </section>

            <section
              id={RECENT_FEED_SECTION_ID}
              className="w-full scroll-mt-24 px-5 pb-6 sm:px-6"
              aria-labelledby="recent-projects"
            >
              <h2 id="recent-projects" className="font-display text-3xl font-medium tracking-tight">
                Recently published
              </h2>
              <p className="mt-1 text-base text-muted-foreground">
                Every project published by Tickif designers, newest first
              </p>

              <div className="mt-3">
                <ProjectFeed
                  initialPage={initialPage}
                  request={request}
                  showTryFilter={false}
                  paginationParams={paginationParams}
                />
              </div>
            </section>
          </>
        ) : (
          <section className="w-full px-5 py-6 sm:px-6" aria-labelledby="project-results">
            <div>
              <h2 id="project-results" className="font-display text-3xl font-medium tracking-tight">
                {query ? `Results for “${query}”` : 'Projects'}
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
                paginationParams={paginationParams}
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
