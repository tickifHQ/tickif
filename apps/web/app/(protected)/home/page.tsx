import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Skeleton } from '@repo/ui/components/skeleton';
import { typography } from '@repo/ui/lib/typography';
import { cn } from '@repo/ui/lib/utils';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getVisitorFeedPreferences } from '@/lib/visitor-feed.server';
import { visitorFeedHref } from '@/lib/visitor-feed';
import { listTaxonomyResponseSchema, taxonomyNeedsFreshRead } from '@repo/contracts';
import { ProjectFeed } from '@/components/project-feed';
import { PublicFooter } from '@/components/public-footer';
import { PublicHeader } from '@/components/public-header';
import { HomeSearchBar } from '@/components/home-search-bar';
import { VisitorSavedCountProvider } from '@/components/visitor-saved-count';
import { VisitorHomeLoadError } from '@/components/visitor-home-load-error';
import {
  VisitorActivityLinks,
  VisitorActivitySkeleton,
  VisitorEnquirySummary,
  VisitorSavedSuggestions,
} from '@/components/visitor-home-regions';
import { getVisitorHomeActivity, getVisitorEnquiryCounts } from '@/lib/visitor-home-data.server';
import { VisitorEnquiryCountProvider } from '@/components/visitor-enquiry-count';
import { visibleAccountName } from '@/lib/account-identity';
import { visitorFeedSummary, visitorNearYouHref } from '@/lib/visitor-home';
import { FeedFilters, type FeedFacetOptions } from '@/components/feed-filters';
import { requireActiveVisitor } from '@/lib/auth-guard';
import { FollowingProvider, FollowingFeedTab, FollowingStudios } from '@/components/following-rail';
import { getFollowing } from '@/lib/following.server';
import { VisitorCustomizationDialog } from '@/components/visitor-customization-dialog';
import { api } from '@/lib/api';
import { getServerLogger } from '@/lib/logger.server';
import {
  FEED_FACET_DEFINITIONS,
  parseFeedPage,
  parseFeedParams,
  parseFeedQuery,
} from '@/lib/feed-params';
import {
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

async function fetchTaxonomyOptions() {
  let failed = false;
  const entries = await Promise.all(
    FEED_FACET_DEFINITIONS.map(async (facet) => {
      if (facet.kind === null) return [facet.key, []] as const;
      try {
        const response = await api.api.taxonomy.terms.$get(
          { query: { kind: facet.kind } },
          {
            init: taxonomyNeedsFreshRead(facet.kind)
              ? { cache: 'no-store' }
              : { next: { revalidate: TAXONOMY_REVALIDATE_SECONDS } },
          },
        );
        if (!response.ok) {
          failed = true;
          return [facet.key, []] as const;
        }
        const parsed = listTaxonomyResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          failed = true;
          return [facet.key, []] as const;
        }
        return [
          facet.key,
          parsed.data.terms.map((term) => ({ slug: term.slug, label: term.label })),
        ] as const;
      } catch {
        failed = true;
        return [facet.key, []] as const;
      }
    }),
  );

  return { options: Object.fromEntries(entries) as FeedFacetOptions, failed };
}

async function fetchFeedSafely(
  request: HomeFeedRequest,
  page: number,
): Promise<HomeFeedPage | null> {
  try {
    return await fetchHomeFeedPage(
      request,
      page,
      request.scope === 'following' ? { cookie: (await headers()).get('cookie') ?? '' } : {},
    );
  } catch (error) {
    getServerLogger().error(
      { event: 'web.feed.failed', error, component: 'PersonalHomePage' },
      'Personal feed fetch failed',
    );
    return null;
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
  const session = await requireActiveVisitor();
  const preferencesPromise = getVisitorFeedPreferences().catch(() => null);
  if (Object.keys(params).length === 0) {
    const saved = await preferencesPromise;
    if (saved && Object.keys(saved.filters).length > 0) redirect(visitorFeedHref(saved.filters));
  }
  const page = parseFeedPage(params.page);
  const query = parseFeedQuery(params.q);
  const filters = parseFeedParams(params);
  const visitorView =
    params.view === 'nearby' || params.view === 'explore' || params.view === 'following'
      ? params.view
      : undefined;
  const baseRequest: HomeFeedRequest = {
    filters,
    query,
    sort: 'recent',
    ...(visitorView === 'following' ? { scope: 'following' } : {}),
  };

  const activity = getVisitorHomeActivity();
  const enquiryCounts = getVisitorEnquiryCounts().catch(() => null);
  const [taxonomy, feed, preferences, following] = await Promise.all([
    fetchTaxonomyOptions(),
    fetchFeedSafely(baseRequest, page),
    preferencesPromise,
    getFollowing().catch(() => null),
  ]);
  const taxonomyOptions = taxonomy.options;
  const initialPage = feed ?? emptyHomeFeedPage(page);
  const firstName = visibleAccountName(session.user.name, session.user.phoneNumber)?.split(
    /\s+/,
  )[0];
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  );
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const summary = visitorFeedSummary(filters, taxonomyOptions);
  const nearbyHref = preferences ? visitorNearYouHref(preferences.filters) : null;
  const nearbyLocation = preferences
    ? (taxonomyOptions.locality?.find((term) => term.slug === preferences.filters.localitySlug)
        ?.label ??
      taxonomyOptions.city?.find((term) => term.slug === preferences.filters.citySlug)?.label)
    : undefined;
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
    ...searchLabelMaps(taxonomyOptions),
  };
  const paginationParams = canonicalFeedParams(params, 1);
  const previousHref = page > 1 ? feedPageLink(params, page - 1, '/home') : null;
  const nextHref = initialPage.hasMore ? feedPageLink(params, page + 1, '/home') : null;

  return (
    <VisitorSavedCountProvider
      key={`${session.user.id}:${JSON.stringify(params)}`}
      userId={session.user.id}
    >
      <VisitorEnquiryCountProvider userId={session.user.id}>
        <FollowingProvider key={session.user.id} userId={session.user.id} initialData={following}>
          <div className="flex min-h-screen flex-col bg-visitor-home-background">
            {previousHref ? <link rel="prev" href={previousHref} /> : null}
            {nextHref ? <link rel="next" href={nextHref} /> : null}
            <PublicHeader
              isAuthenticated
              visitor
              visitorView={visitorView}
              userRole={session.user.role ?? null}
              visitorSearch={
                <HomeSearchBar
                  variant="header"
                  showShortcut
                  initialQuery={query}
                  cities={taxonomyOptions.city}
                  basePath="/home"
                />
              }
              visitorActivity={
                <Suspense fallback={<VisitorActivitySkeleton navigation />}>
                  <VisitorActivityLinks activity={activity} counts={enquiryCounts} navigation />
                </Suspense>
              }
            />
            <main className="flex w-full min-w-0 flex-1 flex-col gap-6 px-5 py-8 sm:px-8 lg:px-12">
              <div className="grid min-w-0 items-center gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
                <header className="flex min-w-0 flex-col gap-1.5">
                  <h1 className={cn(typography.headingH2, 'break-words text-2xl sm:text-section')}>
                    {firstName ? `${greeting}, ${firstName}` : greeting}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className={cn(typography.bodySm, 'text-muted-foreground')}>
                      {summary.length ? 'Tuned for' : 'Find inspiration for your next home.'}
                    </p>
                    {summary.length ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {summary.map((label, index) => (
                          <Badge
                            key={`${index}-${label}`}
                            variant="preference"
                            size="label"
                            shape="square"
                            className="max-w-full whitespace-normal break-words"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <VisitorCustomizationDialog />
                  </div>
                </header>
                <Suspense fallback={<Skeleton className="h-18 w-full xl:w-md" />}>
                  <VisitorEnquirySummary activity={activity} />
                </Suspense>
              </div>
              {!preferences ? (
                <VisitorHomeLoadError
                  title="Customization unavailable"
                  message="Your saved preferences could not be loaded. Your current feed is still available."
                />
              ) : null}
              {taxonomy.failed ? (
                <VisitorHomeLoadError
                  title="Some filters are unavailable"
                  message="We could not load all filter options. You can still browse your current projects."
                />
              ) : null}
              <div className="sm:hidden">
                <Suspense fallback={<VisitorActivitySkeleton />}>
                  <VisitorActivityLinks activity={activity} counts={enquiryCounts} />
                </Suspense>
              </div>

              <section className="w-full" aria-label="Discover">
                <h2 className="sr-only">Explore home projects</h2>
                <div className="mb-8">
                  <Suspense fallback={<Skeleton className="h-28 w-full" />}>
                    <FollowingStudios />
                  </Suspense>
                </div>
                <div>
                  <FeedFilters
                    presentation="visitor"
                    forYouActive={
                      !visitorView &&
                      !query &&
                      filters.room.length === 0 &&
                      filters.budgetBand.length === 0
                    }
                    leadingActions={
                      <>
                        <FollowingFeedTab active={visitorView === 'following'} />
                        {nearbyHref ? (
                          <Button
                            asChild
                            variant="discovery-tab"
                            size="discovery-tab"
                            className="shrink-0"
                          >
                            <Link
                              href={nearbyHref}
                              aria-label="Near you"
                              aria-current={visitorView === 'nearby' ? 'page' : undefined}
                            >
                              Near you
                              {nearbyLocation ? (
                                <span
                                  title={nearbyLocation}
                                  className={cn(
                                    typography.monoMd,
                                    'max-w-20 truncate',
                                    visitorView === 'nearby'
                                      ? 'text-background/80'
                                      : 'text-muted-foreground',
                                  )}
                                >
                                  {nearbyLocation}
                                </span>
                              ) : null}
                            </Link>
                          </Button>
                        ) : null}
                      </>
                    }
                    options={displayFacetOptions}
                    facetDistribution={initialPage.facetDistribution}
                  />
                </div>
                <div className="mt-4">
                  {feed ? (
                    <ProjectFeed
                      initialPage={initialPage}
                      request={request}
                      infinite
                      presentation="visitor"
                      showTryFilter={false}
                      afterInitialPage={
                        page === 1 &&
                        !query &&
                        !visitorView &&
                        filters.room.length === 0 &&
                        filters.budgetBand.length === 0 &&
                        filters.theme.length === 0 ? (
                          <Suspense fallback={<Skeleton className="my-8 h-72 w-full" />}>
                            <VisitorSavedSuggestions activity={activity} />
                          </Suspense>
                        ) : undefined
                      }
                      paginationParams={paginationParams}
                      paginationBase="/home"
                    />
                  ) : (
                    <VisitorHomeLoadError
                      title="Projects unavailable"
                      message="We could not load your feed. Please try again."
                    />
                  )}
                </div>
              </section>
            </main>
            <PublicFooter />
          </div>
        </FollowingProvider>
      </VisitorEnquiryCountProvider>
    </VisitorSavedCountProvider>
  );
}
