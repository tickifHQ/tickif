import type { FeedFacetOptions } from '@/components/feed-filters';
import type { FeedFilterSuggestion } from '@/components/try-filter-card';
import { FEED_FILTER_KEYS, feedPageHref, parseFeedParams, parseFeedQuery } from '@/lib/feed-params';
import type { HomeFeedRequest } from '@/lib/home-feed';

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

export function budgetSuggestions(
  options: FeedFacetOptions,
  params: FeedPageSearchParams,
  base = '/',
): FeedFilterSuggestion[] {
  const filters = parseFeedParams(params);
  const currentParams = canonicalFeedParams(params, 1);
  // A chip for the band that is already applied would only link to the current page.
  const activeBands = new Set(filters.budgetBand);
  const candidates = (options.budgetBand ?? []).filter((option) => !activeBands.has(option.slug));

  return candidates.slice(0, 5).map((option) => ({
    href: feedPageHref({ ...currentParams, budgetBand: option.slug }, 1, base),
    label: option.label,
  }));
}

export function feedPageLink(params: FeedPageSearchParams, page: number, base = '/'): string {
  return feedPageHref(canonicalFeedParams(params, page), page, base);
}
