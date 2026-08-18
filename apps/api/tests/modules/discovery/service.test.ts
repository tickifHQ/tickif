import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryFeedQuery } from '@repo/contracts';

/** Every facet present with no options — spread and override the one under test. */
const emptyVocabulary = {
  citySlug: [] as string[],
  localitySlug: [] as string[],
  propertyTypeSlug: [] as string[],
  propertySubtypeSlug: [] as string[],
  scopeSlug: [] as string[],
  bhkSlug: [] as string[],
  budgetBandSlug: [] as string[],
  roomSlugs: [] as string[],
  themes: [] as string[],
};

vi.mock('../../../src/modules/discovery/repository.js', () => ({
  discoveryRepository: {
    searchFeed: vi.fn(),
    listFeedFallback: vi.fn(),
    findThemeSlugs: vi.fn(async () => new Map<string, string[]>()),
    // Facet plumbing: both paths report sparse counts, which the service densifies
    // against this vocabulary. Default to an empty vocabulary → empty distribution.
    listFacetVocabulary: vi.fn(async () => ({ ...emptyVocabulary })),
    countFeedFacets: vi.fn(async () => ({})),
  },
}));
vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: {
    findTaxonomyLabels: vi.fn(async () => new Map<string, string>()),
    findLocalityLabels: vi.fn(async () => new Map<string, string>()),
  },
}));
vi.mock('../../../src/modules/discovery/mapper.js', () => ({
  collectTaxonomyPairs: vi.fn(() => []),
  normalizeTypesenseHit: vi.fn((hit) => ({ ...hit, themeSlugs: hit.themes ?? [] })),
  normalizePostgresRow: vi.fn((row) => ({ ...row, themeSlugs: [] })),
  toDiscoveryCard: vi.fn(async (item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    studio: item.designerName,
    city: null,
    locality: null,
    rating: Number(item.avgRating) || 0,
    reviewCount: item.reviewCount,
    budget: null,
    tags: [],
    coverImageId: null,
    coverImageUrl: null,
    imageWidth: null,
    imageHeight: null,
  })),
}));

const { discoveryService, isTypesenseConfigured, logFallbackEvent } =
  await import('../../../src/modules/discovery/service.js');
const { discoveryRepository } = await import('../../../src/modules/discovery/repository.js');

const query: DiscoveryFeedQuery = { sort: 'recent', page: 1, limit: 24 };
const searchHit = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'calm-home',
  title: 'Calm Home',
  designerName: 'Studio One',
  themes: [],
  avgRating: 4.5,
  reviewCount: 2,
};
const postgresRow = {
  ...searchHit,
  designerSlug: 'studio-one',
  citySlug: 'mumbai',
  localitySlug: null,
  bhkSlug: '3-bhk',
  budgetBandSlug: null,
  avgRating: '4.5',
  coverImageId: null,
  coverStatus: null,
  coverDerivatives: null,
};

describe('discoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('detects complete Typesense configuration', () => {
    expect(isTypesenseConfigured()).toBe(true);
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    expect(isTypesenseConfigured()).toBe(false);
  });

  it('returns canonical cards and fallback metadata from Typesense', async () => {
    vi.mocked(discoveryRepository.listFacetVocabulary).mockResolvedValue({
      ...emptyVocabulary,
      citySlug: ['mumbai'],
    });
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
      hits: [searchHit as never],
      found: 1,
      facetDistribution: { citySlug: { mumbai: 1 } },
    });

    await expect(discoveryService.getFeed(query)).resolves.toMatchObject({
      items: [{ id: searchHit.id, studio: 'Studio One' }],
      source: 'search',
      fallback: 'none',
      relaxedFilters: [],
      facetDistribution: { citySlug: { mumbai: 1 } },
    });
    expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
      expect.objectContaining({ q: '', page: 1, perPage: 24 }),
    );
  });

  it('uses the shared relaxation order for bounded text search', async () => {
    vi.mocked(discoveryRepository.searchFeed)
      .mockResolvedValueOnce({ hits: [], found: 0 })
      .mockResolvedValueOnce({ hits: [searchHit as never], found: 1 });

    const result = await discoveryService.getFeed({
      ...query,
      q: 'calm',
      localitySlug: 'bandra',
      budgetBandSlug: '40-60-lakh',
    });

    expect(result).toMatchObject({ fallback: 'relaxed', relaxedFilters: ['localitySlug'] });
    expect(discoveryRepository.searchFeed).toHaveBeenCalledTimes(2);
  });

  it('does not relax or restart results when a later Typesense page is empty', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 30 });

    const result = await discoveryService.getFeed({
      ...query,
      q: 'loft',
      page: 3,
      citySlug: 'mumbai',
      localitySlug: 'bandra',
    });

    expect(result).toMatchObject({
      items: [],
      page: 3,
      hasMore: false,
      fallback: 'none',
      relaxedFilters: [],
    });
    expect(discoveryRepository.searchFeed).toHaveBeenCalledTimes(1);
    expect(discoveryRepository.listFeedFallback).not.toHaveBeenCalled();
  });

  it('falls back to recent projects in the requested city after exhausted search', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    const result = await discoveryService.getFeed({ ...query, q: 'missing', citySlug: 'mumbai' });

    expect(result).toMatchObject({ source: 'db', fallback: 'recent_in_city' });
    expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
      expect.objectContaining({ q: '', filterBy: { citySlug: 'mumbai' }, offset: 0 }),
    );
  });

  it('logs recent_in_city, and reports neither more pages nor unhelpful relaxations', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });
    // A full page of rows — the pre-fix `rows.length === limit` would advertise hasMore.
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
      rows: Array.from({ length: 2 }, () => postgresRow),
    });

    const result = await discoveryService.getFeed({
      ...query,
      limit: 2,
      q: 'missing',
      citySlug: 'mumbai',
      // Dropped by relaxation without ever producing a hit, so it must not be reported.
      localitySlug: 'bandra',
    });

    expect(result).toMatchObject({
      fallback: 'recent_in_city',
      hasMore: false,
      relaxedFilters: [],
    });
    const logged = vi.mocked(console.log).mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(logged).toContainEqual(
      expect.objectContaining({ type: 'discovery.fallback', reason: 'recent_in_city' }),
    );
  });

  it('reports no further pages when the Postgres path itself lands on recent_in_city', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.mocked(discoveryRepository.listFeedFallback)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [postgresRow, postgresRow] });

    const result = await discoveryService.getFeed({
      ...query,
      limit: 2,
      q: 'missing',
      citySlug: 'mumbai',
    });

    expect(result).toMatchObject({
      source: 'db',
      fallback: 'recent_in_city',
      hasMore: false,
      relaxedFilters: [],
    });
  });

  it('uses Postgres when Typesense is unavailable and keeps the response shape identical', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    await expect(discoveryService.getFeed({ ...query, q: 'calm' })).resolves.toMatchObject({
      items: [{ id: searchHit.id, studio: 'Studio One' }],
      source: 'db',
      fallback: 'none',
      relaxedFilters: [],
    });
  });

  it('runs one bounded Postgres search without filter relaxation', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

    const result = await discoveryService.getFeed({
      ...query,
      q: 'calm',
      localitySlug: 'bandra',
      budgetBandSlug: '40-60-lakh',
    });

    expect(result).toMatchObject({ items: [], fallback: 'none', relaxedFilters: [] });
    expect(discoveryRepository.listFeedFallback).toHaveBeenCalledTimes(1);
  });

  it('does not restart an empty later Postgres page at offset zero', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

    const result = await discoveryService.getFeed({
      ...query,
      q: 'loft',
      page: 3,
      citySlug: 'mumbai',
    });

    expect(result).toMatchObject({
      items: [],
      page: 3,
      hasMore: false,
      fallback: 'none',
      relaxedFilters: [],
    });
    expect(discoveryRepository.listFeedFallback).toHaveBeenCalledTimes(1);
    expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 48 }),
    );
  });

  it('logs the Typesense error reason before degrading to Postgres', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    const result = await discoveryService.getFeed(query);

    expect(result.source).toBe('db');
    const logged = vi.mocked(console.log).mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(logged).toContainEqual(
      expect.objectContaining({ type: 'discovery.fallback', reason: 'Connection refused' }),
    );
  });

  it('logs "unknown" when the Typesense rejection is not an Error', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockRejectedValue('string error');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    await discoveryService.getFeed(query);

    const logged = vi.mocked(console.log).mock.calls.map((call) => JSON.parse(call[0] as string));
    expect(logged).toContainEqual(expect.objectContaining({ reason: 'unknown' }));
  });
});

describe('facet distribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(discoveryRepository.listFacetVocabulary).mockResolvedValue({ ...emptyVocabulary });
    vi.mocked(discoveryRepository.countFeedFacets).mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('fills every taxonomy option Typesense omitted with a zero count', async () => {
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    vi.mocked(discoveryRepository.listFacetVocabulary).mockResolvedValue({
      ...emptyVocabulary,
      citySlug: ['mumbai', 'pune'],
      themes: ['warm', 'minimal'],
    });
    // Typesense never emits `count: 0` — pune and minimal are simply absent.
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
      hits: [],
      found: 0,
      facetDistribution: { citySlug: { mumbai: 3 }, themes: { warm: 1 } },
    });

    const result = await discoveryService.getFeed(query);

    expect(result.source).toBe('search');
    expect(result.facetDistribution.citySlug).toEqual({ mumbai: 3, pune: 0 });
    expect(result.facetDistribution.themes).toEqual({ warm: 1, minimal: 0 });
  });

  it('reports a facet the vocabulary knows about even when nothing matched at all', async () => {
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    vi.mocked(discoveryRepository.listFacetVocabulary).mockResolvedValue({
      ...emptyVocabulary,
      bhkSlug: ['2-bhk'],
    });
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

    const result = await discoveryService.getFeed(query);

    expect(result.facetDistribution.bhkSlug).toEqual({ '2-bhk': 0 });
  });

  it('densifies the Postgres path from its own counts, so both paths agree in shape', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });
    vi.mocked(discoveryRepository.listFacetVocabulary).mockResolvedValue({
      ...emptyVocabulary,
      citySlug: ['mumbai', 'pune'],
    });
    vi.mocked(discoveryRepository.countFeedFacets).mockResolvedValue({ citySlug: { mumbai: 2 } });

    const result = await discoveryService.getFeed({ ...query, citySlug: 'mumbai' });

    expect(discoveryRepository.countFeedFacets).toHaveBeenCalledWith({ citySlug: 'mumbai' }, '');
    expect(result.source).toBe('db');
    expect(result.facetDistribution.citySlug).toEqual({ mumbai: 2, pune: 0 });
  });

  it('counts facets over the same text-narrowed set as the page it labels', async () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    await discoveryService.getFeed({ ...query, q: 'calm', citySlug: 'mumbai' });

    expect(discoveryRepository.countFeedFacets).toHaveBeenCalledWith(
      { citySlug: 'mumbai' },
      'calm',
    );
  });
});

describe('logFallbackEvent', () => {
  it('never leaks logging failures into the request', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    expect(() => logFallbackEvent('unconfigured', { sort: 'recent' })).not.toThrow();
  });
});
