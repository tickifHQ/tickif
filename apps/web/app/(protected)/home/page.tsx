import { redirect } from 'next/navigation';
import { listTaxonomyResponseSchema } from '@repo/contracts';
import { DesignerOrganizationSwitcher } from '@/components/designer-organization-switcher';
import { ProjectFeed } from '@/components/project-feed';
import { PublicHeader } from '@/components/public-header';
import { HomeSearchBar } from '@/components/home-search-bar';
import { FeedFilters, type FeedFacetOptions } from '@/components/feed-filters';
import { activeContextForSession, getServerSession } from '@/lib/auth-guard';
import { api } from '@/lib/api';
import {
  FEED_FACET_DEFINITIONS,
  parseFeedPage,
  parseFeedParams,
  parseFeedQuery,
} from '@/lib/feed-params';
import {
  budgetSuggestions,
  canonicalFeedParams,
  feedPageLink,
  searchLabelMaps,
  type FeedPageSearchParams,
} from '@/lib/feed-page-helpers';
import {
  emptyHomeFeedPage,
  fetchHomeFeedPage,
  type HomeFeedPage,
  type HomeFeedRequest,
} from '@/lib/home-feed';

export const metadata = {
  title: 'My Tickif · Tickif',
};

type PersonalHomePageProps = {
  searchParams?: Promise<FeedPageSearchParams>;
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
    console.error('[PersonalHomePage] feed fetch failed', error);
    return emptyHomeFeedPage(page);
  }
}

/**
 * Personal workspace mirroring the signed-in homepage feed: the same search,
 * filters, and masonry feed arranged under the My Tickif greeting, plus the
 * personal enquiries section. Pagination and suggestion links stay on /home.
 */
export default async function PersonalHomePage({
  searchParams = Promise.resolve({}),
}: PersonalHomePageProps = {}) {
  const params = await searchParams;
  const page = parseFeedPage(params.page);
  const query = parseFeedQuery(params.q);
  const filters = parseFeedParams(params);
  const baseRequest: HomeFeedRequest = { filters, query, sort: 'recent' };
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }
  if (activeContextForSession(session).kind === 'organization') {
    redirect('/designer/dashboard');
  }

  const [taxonomyOptions, initialPage] = await Promise.all([
    fetchTaxonomyOptions(),
    fetchFeedSafely(baseRequest, page),
  ]);
  const firstName = session?.user.name?.trim().split(/\s+/)[0];
  const request: HomeFeedRequest = {
    ...baseRequest,
    ...searchLabelMaps(taxonomyOptions),
  };
  const filterSuggestions = budgetSuggestions(taxonomyOptions, params, '/home');
  const paginationParams = canonicalFeedParams(params, 1);
  const previousHref = page > 1 ? feedPageLink(params, page - 1, '/home') : null;
  const nextHref = initialPage.hasMore ? feedPageLink(params, page + 1, '/home') : null;

  return (
    <div className="bg-background">
      {previousHref ? <link rel="prev" href={previousHref} /> : null}
      {nextHref ? <link rel="next" href={nextHref} /> : null}
      <PublicHeader
        isAuthenticated
        userRole={session.user.role ?? null}
        contextSwitcher={
          <div className="w-40 sm:w-48">
            <DesignerOrganizationSwitcher
              activeOrganizationId={null}
              studioName={session.user.name?.trim() || session.user.email || 'My Tickif'}
              studioLocation="My Tickif"
            />
          </div>
        }
      />
      <main className="w-full space-y-8 px-5 py-10 sm:px-8 lg:py-12">
        <header className="space-y-1.5">
          <p className="font-mono text-xs tracking-wider text-foreground-disabled uppercase">
            My Tickif
          </p>
          <h1 className="text-2xl font-medium leading-tight text-foreground">
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Discover studios and projects, and keep track of your enquiries.
          </p>
        </header>

        <section className="w-full" aria-label="Discover">
          <h2 className="sr-only">Explore home projects</h2>
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
      </main>
    </div>
  );
}
