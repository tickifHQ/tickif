import {
  designerSortOption,
  designerEntityType,
  searchDesignersQuerySchema,
  type SearchDesignersQuery,
} from '@repo/contracts';

export const DESIGNER_PAGE_SIZE = 24;
export const MAX_DESIGNER_PAGE = Math.floor(1000 / DESIGNER_PAGE_SIZE);
export const DESIGNER_FACETS = [
  { key: 'citySlugs', label: 'City', kind: 'city' },
  { key: 'localitySlugs', label: 'Locality', kind: 'locality' },
  { key: 'scopeSlugs', label: 'Scope', kind: 'scope' },
  { key: 'themeSlugs', label: 'Style', kind: 'theme' },
] as const;
export type DesignerFacetKey = (typeof DESIGNER_FACETS)[number]['key'];
export type DesignerFacetOptions = Record<
  DesignerFacetKey,
  Array<{ value: string; label: string }>
>;

export function facetValues(value: string | string[] | undefined): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [value ?? ''])
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry.length <= 80),
    ),
  ]
    .sort()
    .slice(0, 20);
}

/** Normalize URL input with the same constraints as the public search API. */
export function parseDesignerParams(
  params: Record<string, string | string[] | undefined>,
): SearchDesignersQuery {
  const first = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const rawPage = Number(first('page'));
  const page = Number.isInteger(rawPage) ? Math.min(Math.max(rawPage, 1), MAX_DESIGNER_PAGE) : 1;
  const sort = designerSortOption.safeParse(first('sort'));
  const entityType = designerEntityType.safeParse(first('entityType'));
  const query: SearchDesignersQuery = {
    q: (first('q') ?? '').trim().slice(0, 200),
    page,
    limit: DESIGNER_PAGE_SIZE,
    sort: sort.success ? sort.data : 'relevance',
    ...(entityType.success ? { entityType: entityType.data } : {}),
  };
  for (const facet of DESIGNER_FACETS) {
    const values = facetValues(params[facet.key]);
    if (values.length) query[facet.key] = values;
  }
  const parsed = searchDesignersQuerySchema.safeParse(query);
  return parsed.success
    ? parsed.data
    : { q: '', page: 1, limit: DESIGNER_PAGE_SIZE, sort: 'relevance' };
}

export function designerPageHref(query: SearchDesignersQuery, page = query.page): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  for (const { key } of DESIGNER_FACETS) {
    for (const value of facetValues(query[key])) params.append(key, value);
  }
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.sort !== 'relevance') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(Math.min(page, MAX_DESIGNER_PAGE)));
  return `/designers${params.size ? `?${params}` : ''}`;
}

export function designerFacetLabel(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
