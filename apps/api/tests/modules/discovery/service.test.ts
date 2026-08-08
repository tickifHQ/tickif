import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryFeedQuery } from '@repo/contracts';

vi.mock('../../../src/modules/discovery/repository.js', () => ({
  discoveryRepository: {
    searchFeed: vi.fn(),
    listFeedFallback: vi.fn(),
    findThemeSlugs: vi.fn(async () => new Map<string, string[]>()),
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

const { discoveryService, isTypesenseConfigured, logFallbackEvent } = await import(
  '../../../src/modules/discovery/service.js'
);
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

  it('falls back to recent projects in the requested city after exhausted search', async () => {
    vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [postgresRow] });

    const result = await discoveryService.getFeed({ ...query, q: 'missing', citySlug: 'mumbai' });

    expect(result).toMatchObject({ source: 'db', fallback: 'recent_in_city' });
    expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
      expect.objectContaining({ q: '', filterBy: { citySlug: 'mumbai' }, offset: 0 }),
    );
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
});

describe('logFallbackEvent', () => {
  it('never leaks logging failures into the request', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {
      throw new Error('logger unavailable');
    });
    expect(() => logFallbackEvent('unconfigured', { sort: 'recent' })).not.toThrow();
  });
});
