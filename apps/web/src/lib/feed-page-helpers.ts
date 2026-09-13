import type { FeedFacetOptions } from '@/components/feed-filters';
import type { FeedFilterSuggestion } from '@/components/try-filter-card';
import {
  FEED_FACET_DEFINITIONS,
  FEED_FILTER_KEYS,
  feedPageHref,
  parseFeedParams,
  parseFeedQuery,
  type FeedFilterKey,
} from '@/lib/feed-params';
import type { HomeFeedPage, HomeFeedRequest } from '@/lib/home-feed';

export type FeedPageSearchParams = Record<string, string | string[] | undefined>;

function labelsBySlug(options: FeedFacetOptions, key: keyof FeedFacetOptions) {
  return Object.fromEntries((options[key] ?? []).map((option) => [option.slug, option.label]));
}

export function searchLabelMaps(
  options: FeedFacetOptions,
): Pick<
  HomeFeedRequest,
  'cityLabelsBySlug' | 'bhkLabelsBySlug' | 'budgetLabelsBySlug' | 'themeLabelsBySlug'
> {
  return {
    cityLabelsBySlug: labelsBySlug(options, 'city'),
    bhkLabelsBySlug: labelsBySlug(options, 'bhk'),
    budgetLabelsBySlug: labelsBySlug(options, 'budgetBand'),
    themeLabelsBySlug: labelsBySlug(options, 'theme'),
  };
}

export function canonicalFeedParams(
  params: FeedPageSearchParams,
  page: number,
): FeedPageSearchParams {
  const result: FeedPageSearchParams = {};
  const query = parseFeedQuery(params.q);
  if (query) result.q = query;

  const filters = parseFeedParams(params);
  for (const key of FEED_FILTER_KEYS) {
    if (filters[key].length > 0) result[key] = filters[key].join(',');
  }
  if (page > 1) result.page = String(page);

  return result;
}

const FILTER_SUGGESTION_PRIORITY: readonly FeedFilterKey[] = [
  'budgetBand',
  'theme',
  'room',
  'bhk',
  'city',
  'propertyType',
  'scope',
];
const MAX_FILTER_SUGGESTIONS = 10;

export function feedFilterCardPlacementSeed(random = Math.random): number {
  return Math.floor(random() * 0x1_0000_0000);
}

type RankedFilterSuggestion = FeedFilterSuggestion & {
  optionIndex: number;
};

export function feedFilterSuggestions(
  options: FeedFacetOptions,
  params: FeedPageSearchParams,
  {
    base = '/',
    facetDistribution = {},
    random = Math.random,
  }: {
    base?: string;
    facetDistribution?: HomeFeedPage['facetDistribution'];
    /** Injectable so selection remains deterministic in tests. */
    random?: () => number;
  } = {},
): FeedFilterSuggestion[] {
  const filters = parseFeedParams(params);
  const currentParams = canonicalFeedParams(params, 1);
  const candidatesByFacet: RankedFilterSuggestion[][] = [];

  for (const key of FILTER_SUGGESTION_PRIORITY) {
    const definition = FEED_FACET_DEFINITIONS.find((facet) => facet.key === key);
    if (!definition) continue;

    const activeValues = new Set(filters[key]);
    const liveCounts = facetDistribution[definition.apiKey];
    const candidates = (options[key] ?? [])
      .map((option, optionIndex) => ({ option, optionIndex }))
      // An active value would only link back to the page the visitor is already viewing.
      .filter(({ option }) => !activeValues.has(option.slug))
      // When the API supplies live facets, never suggest an option with no matching projects.
      .filter(({ option }) => liveCounts === undefined || (liveCounts[option.slug] ?? 0) > 0)
      .map(({ option, optionIndex }): RankedFilterSuggestion => ({
        href: feedPageHref({ ...currentParams, [key]: option.slug }, 1, base),
        label: option.label,
        facet: key,
        facetLabel: definition.label,
        optionIndex,
        ...(liveCounts === undefined ? {} : { resultCount: liveCounts[option.slug] ?? 0 }),
      }))
      .sort(
        (left, right) =>
          (right.resultCount ?? -1) - (left.resultCount ?? -1) ||
          left.optionIndex - right.optionIndex,
      );

    if (candidates.length > 0) candidatesByFacet.push(candidates);
  }

  // Prefer one option from each available category before filling spare slots.
  // This keeps the card varied instead of allowing a large budget facet to dominate it.
  const selectedByFacet = candidatesByFacet.map((candidates) => {
    const selectedIndex = Math.floor(random() * candidates.length);
    return { selected: candidates[selectedIndex]!, selectedIndex };
  });
  const ranked = [
    ...selectedByFacet.map(({ selected }) => selected),
    ...selectedByFacet.flatMap(({ selectedIndex }, facetIndex) =>
      candidatesByFacet[facetIndex]!.filter((_, optionIndex) => optionIndex !== selectedIndex),
    ),
  ];

  return ranked
    .slice(0, MAX_FILTER_SUGGESTIONS)
    .map(({ optionIndex: _optionIndex, ...suggestion }) => suggestion);
}

export function feedPageLink(params: FeedPageSearchParams, page: number, base = '/'): string {
  return feedPageHref(canonicalFeedParams(params, page), page, base);
}
