import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchDesignersQuerySchema, type SearchDesignersResponse } from '@repo/contracts';
import {
  designerPageHref,
  MAX_DESIGNER_PAGE,
  parseDesignerParams,
} from '../../src/lib/designer-discovery-params';
import {
  fetchDesignerFacetOptions,
  fetchDesignerSearch,
} from '../../src/lib/designer-discovery-api';

const mocks = vi.hoisted(() => ({ search: vi.fn(), taxonomy: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      search: { designers: { $get: mocks.search } },
      taxonomy: { terms: { $get: mocks.taxonomy } },
    },
  },
}));
beforeEach(() => vi.clearAllMocks());

describe('designer discovery URL state', () => {
  it('round-trips multiple facets, entity and sort through pagination', () => {
    const query = parseDesignerParams({
      q: '  Studio  ',
      citySlugs: ['mumbai,pune', 'pune'],
      themeSlugs: 'modern',
      localitySlugs: 'bandra',
      scopeSlugs: 'full-home',
      entityType: 'company',
      sort: 'yearsExperience:desc',
      page: '2',
    });
    const url = new URL(designerPageHref(query, 3), 'http://localhost');
    expect(url.searchParams.getAll('citySlugs')).toEqual(['mumbai', 'pune']);
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('sort')).toBe('yearsExperience:desc');
    expect(url.searchParams.get('entityType')).toBe('company');
    expect(url.searchParams.get('q')).toBe('Studio');
    expect(url.searchParams.get('scopeSlugs')).toBe('full-home');
    expect(url.searchParams.get('localitySlugs')).toBe('bandra');
    expect(url.searchParams.get('themeSlugs')).toBe('modern');
    expect(designerPageHref(query, 1)).not.toContain('page=');
  });
  it('canonicalizes equivalent facet selections to the same stable URL', () => {
    const first = parseDesignerParams({ citySlugs: ['pune', 'mumbai', 'pune'] });
    const second = parseDesignerParams({ citySlugs: ['mumbai', 'pune'] });
    expect(designerPageHref(first)).toBe('/designers?citySlugs=mumbai&citySlugs=pune');
    expect(designerPageHref(second)).toBe(designerPageHref(first));
  });
  it.each(['0', '-1', 'Infinity', '2garbage', '1.5'])('normalizes invalid page %s', (page) => {
    expect(parseDesignerParams({ page }).page).toBe(1);
  });
  it('bounds the request to the API window and drops unrecognized input', () => {
    const query = parseDesignerParams({
      q: 'x'.repeat(300),
      page: '99999',
      limit: '48',
      sort: 'private',
      entityType: 'admin',
      citySlugs: [...Array.from({ length: 25 }, (_, i) => `city-${i}`), 'x'.repeat(81)],
      secret: 'ignored',
    });
    expect(query.page).toBe(MAX_DESIGNER_PAGE);
    expect(query.q).toHaveLength(200);
    expect(query.citySlugs).toHaveLength(20);
    expect(query.limit).toBe(24);
    expect(query.sort).toBe('relevance');
    expect(query.entityType).toBeUndefined();
    expect(searchDesignersQuerySchema.safeParse(query).success).toBe(true);
    expect(designerPageHref(query)).not.toContain('secret');
  });
});

describe('designer discovery API', () => {
  const empty: SearchDesignersResponse = {
    hits: [],
    page: 1,
    limit: 24,
    estimatedTotalHits: 0,
    facetDistribution: {},
    processingTimeMs: 0,
  };
  it('uses the designer endpoint and wildcard for browsing, without caching results', async () => {
    mocks.search.mockResolvedValue({ ok: true, json: async () => empty });
    const query = parseDesignerParams({});
    await expect(fetchDesignerSearch(query)).resolves.toEqual(empty);
    expect(mocks.search).toHaveBeenCalledWith(
      { query: { ...query, q: '*' } },
      { init: { cache: 'no-store' } },
    );
  });
  it('keeps query, filter and sort semantics in the typed request', async () => {
    mocks.search.mockResolvedValue({ ok: true, json: async () => empty });
    const query = parseDesignerParams({
      q: 'oak',
      citySlugs: ['pune', 'mumbai'],
      sort: 'reviewCount:desc',
      page: '2',
    });
    await fetchDesignerSearch(query);
    expect(mocks.search.mock.calls[0]?.[0]).toEqual({ query });
  });
  it('does not disguise service failure as no matching designers', async () => {
    mocks.search.mockResolvedValue({ ok: false });
    await expect(fetchDesignerSearch(parseDesignerParams({}))).rejects.toThrow('unavailable');
  });
  it('rejects an invalid response', async () => {
    mocks.search.mockResolvedValue({ ok: true, json: async () => ({ projects: [] }) });
    await expect(fetchDesignerSearch(parseDesignerParams({}))).rejects.toThrow('invalid response');
  });
  it('loads all taxonomy-backed facets, including localities outside current results', async () => {
    mocks.taxonomy.mockImplementation(async ({ query }: { query: { kind: string } }) => ({
      ok: true,
      json: async () => ({
        terms: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            slug: `${query.kind}-value`,
            label: `${query.kind} label`,
            parentId: null,
          },
        ],
      }),
    }));
    await expect(fetchDesignerFacetOptions()).resolves.toMatchObject({
      localitySlugs: [{ value: 'locality-value', label: 'locality label' }],
    });
    expect(mocks.taxonomy.mock.calls.map(([request]) => request.query.kind).sort()).toEqual([
      'city',
      'locality',
      'scope',
      'theme',
    ]);
  });
});
