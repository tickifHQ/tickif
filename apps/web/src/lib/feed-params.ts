import type { DiscoveryFeedQuery, SearchProjectsQuery } from '@repo/contracts';

export const HOME_FEED_PAGE_SIZE = 24;
export const MAX_HOME_FEED_PAGE = Math.floor(1000 / HOME_FEED_PAGE_SIZE);

export const FEED_FILTER_KEYS = [
  'city',
  'bhk',
  'propertyType',
  'scope',
  'budgetBand',
  'room',
  'theme',
] as const;

export type FeedFilterKey = (typeof FEED_FILTER_KEYS)[number];

export type FeedFilterState = Record<FeedFilterKey, string[]>;

export type FeedFacetKey =
  | 'citySlug'
  | 'bhkSlug'
  | 'propertyTypeSlug'
  | 'scopeSlug'
  | 'budgetBandSlug'
  | 'roomSlugs'
  | 'themes';

type FeedTaxonomyKind =
  'city' | 'bhk' | 'property_type' | 'scope' | 'budget_band' | 'room' | 'theme';

export const FEED_FACET_DEFINITIONS: ReadonlyArray<{
  key: FeedFilterKey;
  apiKey: FeedFacetKey;
  kind: FeedTaxonomyKind;
  label: string;
}> = [
  { key: 'city', apiKey: 'citySlug', kind: 'city', label: 'City' },
  { key: 'bhk', apiKey: 'bhkSlug', kind: 'bhk', label: 'BHK' },
  {
    key: 'propertyType',
    apiKey: 'propertyTypeSlug',
    kind: 'property_type',
    label: 'Property type',
  },
  { key: 'scope', apiKey: 'scopeSlug', kind: 'scope', label: 'Scope' },
  { key: 'budgetBand', apiKey: 'budgetBandSlug', kind: 'budget_band', label: 'Budget' },
  { key: 'room', apiKey: 'roomSlugs', kind: 'room', label: 'Room' },
  { key: 'theme', apiKey: 'themes', kind: 'theme', label: 'Theme' },
];

const FEED_FILTER_KEY_SET = new Set<string>(FEED_FILTER_KEYS);
const MAX_VALUES_PER_FACET = 20;

function emptyState(): FeedFilterState {
  return {
    city: [],
    bhk: [],
    propertyType: [],
    scope: [],
    budgetBand: [],
    room: [],
    theme: [],
  };
}

function valuesFor(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
) {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const value = input[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function splitValues(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const part of value.split(',')) {
      const normalized = part.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length === MAX_VALUES_PER_FACET) return result;
    }
  }

  return result;
}

/** Parse the public feed's comma-separated filter params into stable arrays. */
export function parseFeedParams(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): FeedFilterState {
  const state = emptyState();

  for (const key of FEED_FILTER_KEYS) {
    state[key] = splitValues(valuesFor(input, key));
  }

  return state;
}

/** Serialize filter state without changing unrelated query parameters. */
export function serializeFeedParams(
  state: FeedFilterState,
  current?: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(current);

  for (const key of FEED_FILTER_KEYS) {
    params.delete(key);
    const values = splitValues(state[key]);
    if (values.length > 0) params.set(key, values.join(','));
  }

  return params;
}

/** Map the URL state to the typed discovery feed query used by the API. */
export function toDiscoveryFeedFilters(state: FeedFilterState): Partial<DiscoveryFeedQuery> {
  const filters: Partial<DiscoveryFeedQuery> = {};

  for (const facet of FEED_FACET_DEFINITIONS) {
    const values = state[facet.key];
    if (values.length === 0) continue;
    filters[facet.apiKey] = values.length === 1 ? values[0] : values;
  }

  return filters;
}

/** Map the URL state to the matching project-search filter keys. */
export function toSearchProjectFilters(state: FeedFilterState): Partial<SearchProjectsQuery> {
  const filters: Partial<SearchProjectsQuery> = {};

  for (const facet of FEED_FACET_DEFINITIONS) {
    const values = state[facet.key];
    if (values.length === 0) continue;
    filters[facet.apiKey] = values.length === 1 ? values[0] : values;
  }

  return filters;
}

/** Parse and bound the crawlable page number accepted by discovery/search. */
export function parseFeedPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), MAX_HOME_FEED_PAGE);
}

/** Normalize the homepage search term to the shared search contract's limit. */
export function parseFeedQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim().slice(0, 200);
}

/** Preserve the active query and filters while changing the crawlable page. */
export function feedPageHref(
  input: Record<string, string | string[] | undefined>,
  page: number,
  base = '/',
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || key === 'page') continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** Return whether a query key belongs to the public feed filter set. */
export function isFeedFilterKey(value: string): value is FeedFilterKey {
  return FEED_FILTER_KEY_SET.has(value);
}
