import {
  discoveryFeedResponseSchema,
  searchProjectsResponseSchema,
  type FeedProject,
  type ProjectSearchFallback,
} from '@repo/contracts';
import { api } from '@/lib/api';
import {
  HOME_FEED_PAGE_SIZE,
  toDiscoveryFeedFilters,
  toSearchProjectFilters,
  type FeedFilterState,
} from '@/lib/feed-params';

export type HomeFeedRequest = {
  filters: FeedFilterState;
  query: string;
  sort?: 'recent' | 'featured';
  cityLabelsBySlug?: Record<string, string>;
  bhkLabelsBySlug?: Record<string, string>;
  budgetLabelsBySlug?: Record<string, string>;
  themeLabelsBySlug?: Record<string, string>;
};

type SearchLabelMaps = Pick<
  HomeFeedRequest,
  'cityLabelsBySlug' | 'bhkLabelsBySlug' | 'budgetLabelsBySlug' | 'themeLabelsBySlug'
>;

/**
 * There is deliberately no `limit` override: every page must be requested at
 * `HOME_FEED_PAGE_SIZE` or `hasMore` stops describing the 24-per-page URLs that
 * `rel=next` and the pagination control link to.
 */
type HomeFeedFetchOptions = {
  searchLabels?: SearchLabelMaps | Promise<SearchLabelMaps>;
};

/**
 * Both feed sources now speak the canonical public project card
 * (`discoveryCardSchema === feedProjectSchema`, owned by the discovery contract),
 * so the search branch below maps `ProjectHit` onto that same shape.
 */
export type HomeFeedPage = {
  items: FeedProject[];
  page: number;
  hasMore: boolean;
  facetDistribution: Record<string, Record<string, number>>;
  fallback: ProjectSearchFallback;
  relaxedFilters: string[];
};

function labelFromSlug(value: string | null, labelsBySlug?: Record<string, string>): string | null {
  if (!value) return null;
  const label = labelsBySlug?.[value];
  if (label) return label;

  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Load one homepage page from search when q is present, otherwise discovery. */
export async function fetchHomeFeedPage(
  request: HomeFeedRequest,
  page: number,
  options: HomeFeedFetchOptions = {},
): Promise<HomeFeedPage> {
  const limit = HOME_FEED_PAGE_SIZE;

  if (request.query) {
    const responsePromise = api.api.search.$get(
      {
        query: {
          q: request.query,
          page,
          limit,
          ...toSearchProjectFilters(request.filters),
        },
      },
      { init: { cache: 'no-store' } },
    );
    const [response, labels] = await Promise.all([
      responsePromise,
      Promise.resolve(options.searchLabels ?? request),
    ]);

    if (!response.ok) {
      throw new Error(`Search request failed with status ${response.status}.`);
    }

    const parsed = searchProjectsResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('Search returned an invalid response.');

    return {
      items: parsed.data.hits.map((hit) => ({
        id: hit.id,
        slug: hit.slug,
        title: hit.title,
        studio: hit.designerName,
        city: labelFromSlug(hit.citySlug, labels.cityLabelsBySlug),
        // Localities are not a homepage facet, so there is no label map to consult.
        locality: labelFromSlug(hit.localitySlug),
        // Search documents carry no aggregate rating; the card hides a zero-review score.
        rating: 0,
        reviewCount: 0,
        budget: labelFromSlug(hit.budgetBandSlug, labels.budgetLabelsBySlug),
        tags: [
          labelFromSlug(hit.bhkSlug, labels.bhkLabelsBySlug),
          ...hit.themes.map((theme) => labelFromSlug(theme, labels.themeLabelsBySlug)),
        ].filter((tag): tag is string => tag !== null),
        // Search exposes the presigned cover URL but not the image row id.
        coverImageId: null,
        coverImageUrl: hit.coverImageUrl,
        imageWidth: null,
        imageHeight: null,
      })),
      page: parsed.data.page,
      hasMore: parsed.data.page * parsed.data.limit < parsed.data.estimatedTotalHits,
      facetDistribution: parsed.data.facetDistribution,
      fallback: parsed.data.fallback,
      relaxedFilters: parsed.data.relaxedFilters,
    };
  }

  const response = await api.api.discovery.feed.$get(
    {
      query: {
        sort: request.sort ?? 'recent',
        page,
        limit,
        ...toDiscoveryFeedFilters(request.filters),
      },
    },
    { init: { cache: 'no-store' } },
  );

  if (!response.ok) {
    throw new Error(`Discovery request failed with status ${response.status}.`);
  }

  const parsed = discoveryFeedResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Discovery returned an invalid response.');

  return {
    items: parsed.data.items,
    page: parsed.data.page,
    hasMore: parsed.data.hasMore,
    facetDistribution: parsed.data.facetDistribution,
    fallback: parsed.data.fallback,
    relaxedFilters: parsed.data.relaxedFilters,
  };
}

export function emptyHomeFeedPage(page: number): HomeFeedPage {
  return {
    items: [],
    page,
    hasMore: false,
    facetDistribution: {},
    fallback: 'none',
    relaxedFilters: [],
  };
}
