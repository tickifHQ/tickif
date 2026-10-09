import type { Metadata } from 'next';
import { HOME_SOCIAL_COPY, publicMetadata } from '@/lib/social-metadata';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ACCOUNT_STATUS,
  accountStatusSchema,
  listTaxonomyResponseSchema,
  PLATFORM_ROLE,
  platformRoleSchema,
} from '@repo/contracts';
import { api } from '@/lib/api';
import { getBillingCatalog } from '@/lib/billing-catalog';
import { getServerLogger } from '@/lib/logger.server';
import { HomeHero } from '@/components/home-hero';
import { landingShortcuts } from '@/lib/landing-categories';
import { fetchLandingCommunity } from '@/lib/landing-community';
import { HomeSearchBar } from '@/components/home-search-bar';
import { LandingDirectory, LandingDesignerCallout } from '@/components/landing-directory';
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
  feedFilterCardPlacementSeed,
  feedFilterSuggestions,
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
      if (facet.kind === null) return [facet.key, []] as const;
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
    getServerLogger().error(
      { event: 'web.feed.failed', error, component: 'HomePage' },
      'Home feed fetch failed',
    );
    return emptyHomeFeedPage(page);
  }
}

function hasFilters(filters: FeedFilterState): boolean {
  return FEED_FILTER_KEYS.some((key) => filters[key].length > 0);
}

export async function generateMetadata({
  searchParams = Promise.resolve({}),
}: HomePageProps = {}): Promise<Metadata> {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  return publicMetadata({ ...HOME_SOCIAL_COPY, path: feedPageLink(params, page) });
}

/** Real-data homepage shared by logged-out discovery and the logged-in infinite feed. */
export default async function HomePage({ searchParams = Promise.resolve({}) }: HomePageProps = {}) {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  const query = parseFeedQuery(params.q);
  const filters = parseFeedParams(params);
  const baseRequest: HomeFeedRequest = { filters, query, sort: 'recent' };
  const isDefaultFeed = page === 1 && !query && !hasFilters(filters);

  const session = await getServerSession({ disableCookieCache: true });
  if (session) {
    const parsedRole = platformRoleSchema.safeParse(session.user.role);
    if (!parsedRole.success) {
      redirect('/unauthorized');
    }
    if (parsedRole.data === PLATFORM_ROLE.VISITOR) {
      const status = accountStatusSchema.safeParse(session.user.status);
      if (!status.success) redirect('/unauthorized');
      if (status.data === ACCOUNT_STATUS.ACTIVE) redirect(feedPageLink(params, page, '/home'));
      if (status.data !== ACCOUNT_STATUS.PENDING) redirect('/unauthorized');
      // Deferred designer signups are pending visitors until studio creation.
      // Let them explore here without activating a visitor account.
    } else if (parsedRole.data === PLATFORM_ROLE.DESIGNER) {
      if (!session.session.activeOrganizationId) redirect('/designer/select-studio');
    } else {
      redirect('/dashboard');
    }
  }

  const taxonomyOptionsPromise = fetchTaxonomyOptions();
  // One request per feed, always at the real page size: `hasMore` and the
  // rel=prev/next hints have to describe the 24-per-page scheme the links use.
  const initialPagePromise = query
    ? fetchFeedSafely(baseRequest, page, {
        searchLabels: taxonomyOptionsPromise.then(searchLabelMaps),
      })
    : fetchFeedSafely(baseRequest, page);
  const featuredPagePromise = isDefaultFeed
    ? fetchFeedSafely({ filters, query: '', sort: 'featured' }, 1)
    : Promise.resolve(emptyHomeFeedPage(1));

  const [taxonomyOptions, initialPage, featuredPage, catalog, community] = await Promise.all([
    taxonomyOptionsPromise,
    initialPagePromise,
    featuredPagePromise,
    isDefaultFeed ? getBillingCatalog() : Promise.resolve(null),
    isDefaultFeed ? fetchLandingCommunity() : Promise.resolve(null),
  ]);
  const labelMaps = searchLabelMaps(taxonomyOptions);
  const displayFacetOptions: FeedFacetOptions = {
    ...taxonomyOptions,
    tag: Object.keys(initialPage.facetDistribution.tags ?? {}).map((slug) => ({
      slug,
      label: slug
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    })),
  };
  const request: HomeFeedRequest = {
    ...baseRequest,
    ...labelMaps,
  };
  const filterSuggestions = feedFilterSuggestions(displayFacetOptions, params, {
    facetDistribution: initialPage.facetDistribution,
  });
  const paginationParams = canonicalFeedParams(params, 1);

  const previousHref = page > 1 ? feedPageLink(params, page - 1) : null;
  const nextHref = initialPage.hasMore ? feedPageLink(params, page + 1) : null;

  return (
    <>
      {previousHref ? <link rel="prev" href={previousHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
      {isDefaultFeed ? (
        <HomeHero
          shortcuts={landingShortcuts(taxonomyOptions)}
          projects={featuredPage.items.length ? featuredPage.items : initialPage.items}
          cities={taxonomyOptions.city}
          community={community}
        />
      ) : null}

      <div>
        {isDefaultFeed ? (
          <>
            <section
              className="w-full px-5 pb-12 pt-16 sm:px-8 lg:px-12"
              aria-labelledby="featured-projects"
            >
              <div className="sr-only focus-within:not-sr-only">
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

              <div>
                <FeedFilters
                  presentation="landing"
                  options={displayFacetOptions}
                  facetDistribution={initialPage.facetDistribution}
                />
              </div>

              {featuredPage.items.length > 0 ? (
                <div className="mt-9">
                  <ProjectFeed
                    initialPage={{
                      ...featuredPage,
                      items: featuredPage.items.slice(0, 12),
                      hasMore: false,
                    }}
                    request={{ filters, query: '', sort: 'featured' }}
                    infinite={false}
                    presentation="landing"
                    showTryFilter={false}
                  />
                </div>
              ) : null}
            </section>

            <section
              id={RECENT_FEED_SECTION_ID}
              className="w-full scroll-mt-24 px-5 pb-16 sm:px-8 lg:px-12"
              aria-labelledby="recent-projects"
            >
              <h2 id="recent-projects" className="font-display text-3xl font-medium tracking-tight">
                Fresh from the <span className="text-primary">review desk</span>
              </h2>
              <p className="sr-only">Every project published by Tickif designers, newest first</p>

              <div className="mt-9">
                <ProjectFeed
                  initialPage={initialPage}
                  request={request}
                  showTryFilter={false}
                  presentation="landing"
                  autoLoad={false}
                  paginationParams={paginationParams}
                />
              </div>
            </section>
            <LandingDesignerCallout catalog={catalog} />
            <LandingDirectory options={taxonomyOptions} />
          </>
        ) : (
          <section className="w-full px-5 py-8 sm:px-8 lg:px-12" aria-labelledby="project-results">
            <div className="mb-5 max-w-3xl">
              <HomeSearchBar initialQuery={query} />
            </div>
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
                presentation="landing"
                options={displayFacetOptions}
                facetDistribution={initialPage.facetDistribution}
              />
            </div>

            <div className="mt-3">
              <ProjectFeed
                initialPage={initialPage}
                request={request}
                infinite
                presentation="landing"
                filterSuggestions={filterSuggestions}
                filterCardPlacementSeed={feedFilterCardPlacementSeed()}
                paginationParams={paginationParams}
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
