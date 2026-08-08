import {
  discoveryFeedResponseSchema,
  searchProjectsResponseSchema,
  type DiscoveryCard,
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
  budgetLabelsBySlug?: Record<string, string>;
};

export type HomeFeedPage = {
  items: DiscoveryCard[];
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
): Promise<HomeFeedPage> {
  if (request.query) {
    const response = await api.api.search.$get(
      {
        query: {
          q: request.query,
          page,
          limit: HOME_FEED_PAGE_SIZE,
          ...toSearchProjectFilters(request.filters),
        },
      },
      { init: { cache: 'no-store' } },
    );

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
        coverImageUrl: hit.coverImageUrl,
        coverImageWidth: null,
        coverImageHeight: null,
        designerName: hit.designerName,
        designerSlug: hit.designerSlug,
        city: labelFromSlug(hit.citySlug),
        bhk: labelFromSlug(hit.bhkSlug),
        budget: labelFromSlug(hit.budgetBandSlug, request.budgetLabelsBySlug),
        ratingSnippet: null,
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
        limit: HOME_FEED_PAGE_SIZE,
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
    fallback: 'none',
    relaxedFilters: [],
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
