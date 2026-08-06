import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DiscoveryFeedQuery, Derivative } from '@repo/contracts';

// Mock the repository
vi.mock('../../../src/modules/discovery/repository.js', () => ({
  discoveryRepository: {
    searchFeed: vi.fn(),
    listFeedFallback: vi.fn(),
  },
}));

// The service resolves taxonomy labels once per page, so the batch lookup is mocked here.
vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: {
    findTaxonomyLabels: vi.fn(async () => new Map<string, string>()),
  },
}));

// Mock the mapper
vi.mock('../../../src/modules/discovery/mapper.js', () => ({
  collectTaxonomyPairs: vi.fn(() => []),
  normalizeTypesenseHit: vi.fn((hit) => ({ ...hit, normalized: true })),
  normalizePostgresRow: vi.fn((row) => ({ ...row, normalized: true })),
  toDiscoveryCard: vi.fn(async (item) => ({
    slug: item.slug,
    title: item.title,
    coverImageUrl: null,
    coverImageWidth: null,
    coverImageHeight: null,
    designerName: item.designerName,
    designerSlug: item.designerSlug,
    city: null,
    bhk: null,
    ratingSnippet: null,
  })),
}));

// Mock the filter builder
vi.mock('../../../src/modules/discovery/filter-builder.js', () => ({
  buildDiscoveryFilter: vi.fn(() => ''),
}));

// Import AFTER the mocks are registered
const { isTypesenseConfigured, logFallbackEvent, discoveryService } = await import(
  '../../../src/modules/discovery/service.js'
);
const { discoveryRepository } = await import('../../../src/modules/discovery/repository.js');
const { normalizeTypesenseHit, normalizePostgresRow, toDiscoveryCard } = await import(
  '../../../src/modules/discovery/mapper.js'
);

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const defaultQuery: DiscoveryFeedQuery = {
  sort: 'recent',
  page: 1,
  limit: 24,
};

const typesenseHit = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  title: `Project ${slug}`,
  description: null,
  designerId: 'designer-id',
  designerName: 'Designer Name',
  designerSlug: 'designer-slug',
  citySlug: 'mumbai',
  localitySlug: null,
  propertyTypeSlug: null,
  propertySubtypeSlug: null,
  scopeSlug: null,
  bhkSlug: '3-bhk',
  budgetBandSlug: null,
  sizeSqft: null,
  themes: [],
  materials: [],
  finishes: [],
  roomSlugs: [],
  roomLabels: [],
  tags: [],
  coverImageKey: 'cover.jpg',
  avgRating: 4.5,
  reviewCount: 10,
  publishedAt: Date.now(),
  featuredAt: null,
});

const postgresRow = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  title: `Project ${slug}`,
  designerName: 'Designer Name',
  designerSlug: 'designer-slug',
  citySlug: 'mumbai',
  bhkSlug: '3-bhk',
  avgRating: '4.5',
  reviewCount: 10,
  coverStatus: 'ready' as const,
  coverDerivatives: [
    { variant: 'small', format: 'webp', key: 'small.webp', width: 640, height: 480 },
  ] as Derivative[],
});

// ─────────────────────────────────────────────────────────────────────────────
// isTypesenseConfigured
// ─────────────────────────────────────────────────────────────────────────────

describe('isTypesenseConfigured', () => {
  beforeEach(() => {
    // Clear any existing env values
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when both TYPESENSE_HOST and TYPESENSE_SEARCH_API_KEY are set', () => {
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-api-key');
    expect(isTypesenseConfigured()).toBe(true);
  });

  it('returns false when TYPESENSE_HOST is missing', () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-api-key');
    expect(isTypesenseConfigured()).toBe(false);
  });

  it('returns false when TYPESENSE_SEARCH_API_KEY is missing', () => {
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    expect(isTypesenseConfigured()).toBe(false);
  });

  it('returns false when both are missing', () => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    expect(isTypesenseConfigured()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// logFallbackEvent
// ─────────────────────────────────────────────────────────────────────────────

describe('logFallbackEvent', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('logs JSON with correct structure', () => {
    logFallbackEvent('test-reason', { sort: 'recent' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);

    expect(loggedJson).toMatchObject({
      type: 'discovery.fallback',
      reason: 'test-reason',
      endpoint: 'GET /api/discovery/feed',
      sort: 'recent',
    });
    // Verify timestamp is ISO 8601 format
    expect(loggedJson.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('logs correct reason for unconfigured Typesense', () => {
    logFallbackEvent('unconfigured', { sort: 'featured' });

    const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(loggedJson.reason).toBe('unconfigured');
    expect(loggedJson.sort).toBe('featured');
  });

  it('does not throw even if console.log throws (fire-and-forget)', () => {
    consoleLogSpy.mockImplementation(() => {
      throw new Error('Console error');
    });

    // Should not throw
    expect(() => logFallbackEvent('test', { sort: 'recent' })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// discoveryService.getFeed
// ─────────────────────────────────────────────────────────────────────────────

describe('discoveryService.getFeed', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  describe('when Typesense is configured and succeeds', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    });

    it('calls repository.searchFeed with correct params', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 1,
      });

      await discoveryService.getFeed({ ...defaultQuery, sort: 'featured', page: 2 });

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith({
        filterBy: '',
        sortBy: 'featuredAt:desc,publishedAt:desc',
        page: 2,
        perPage: 24,
      });
    });

    it('returns source: "search" on success', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 1,
      });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.source).toBe('search');
    });

    it('does not call repository.listFeedFallback on success', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 1,
      });

      await discoveryService.getFeed(defaultQuery);

      expect(discoveryRepository.listFeedFallback).not.toHaveBeenCalled();
    });

    it('calls normalizeTypesenseHit for each hit', async () => {
      const hits = [typesenseHit('project-1'), typesenseHit('project-2')];
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits,
        found: 2,
      });

      await discoveryService.getFeed(defaultQuery);

      expect(normalizeTypesenseHit).toHaveBeenCalledTimes(2);
      // .map() passes (item, index, array) - verify first argument matches
      expect(vi.mocked(normalizeTypesenseHit).mock.calls[0]![0]).toEqual(hits[0]);
      expect(vi.mocked(normalizeTypesenseHit).mock.calls[1]![0]).toEqual(hits[1]);
    });

    it('calls toDiscoveryCard for each normalized item', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1'), typesenseHit('project-2')],
        found: 2,
      });

      await discoveryService.getFeed(defaultQuery);

      expect(toDiscoveryCard).toHaveBeenCalledTimes(2);
    });

    it('returns correct pagination metadata', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 50,
      });

      const result = await discoveryService.getFeed({ ...defaultQuery, page: 1, limit: 24 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(24);
      expect(result.hasMore).toBe(true);
    });

    it('calculates hasMore correctly when no more results', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 1,
      });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.hasMore).toBe(false);
    });

    it('does not log fallback event on success', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit('project-1')],
        found: 1,
      });

      await discoveryService.getFeed(defaultQuery);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('when Typesense is configured but throws', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    });

    it('falls back to repository.listFeedFallback', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Typesense timeout'));
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(discoveryRepository.listFeedFallback).toHaveBeenCalled();
    });

    it('returns source: "db" on fallback', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Typesense timeout'));
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.source).toBe('db');
    });

    it('logs fallback event with error reason', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(
        new Error('Connection refused'),
      );
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedJson.reason).toBe('Connection refused');
      expect(loggedJson.type).toBe('discovery.fallback');
    });

    it('logs "unknown" reason when error is not an Error instance', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue('string error');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedJson.reason).toBe('unknown');
    });

    it('calls normalizePostgresRow for each row on fallback', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Typesense error'));
      const rows = [postgresRow('project-1'), postgresRow('project-2')];
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows });

      await discoveryService.getFeed(defaultQuery);

      expect(normalizePostgresRow).toHaveBeenCalledTimes(2);
      // .map() passes (item, index, array) - verify first argument matches
      expect(vi.mocked(normalizePostgresRow).mock.calls[0]![0]).toEqual(rows[0]);
      expect(vi.mocked(normalizePostgresRow).mock.calls[1]![0]).toEqual(rows[1]);
    });

    it('calls toDiscoveryCard for each normalized item on fallback', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Typesense error'));
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1'), postgresRow('project-2')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(toDiscoveryCard).toHaveBeenCalledTimes(2);
    });
  });

  describe('when Typesense is not configured', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    });

    it('skips repository.searchFeed entirely', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(discoveryRepository.searchFeed).not.toHaveBeenCalled();
    });

    it('calls repository.listFeedFallback directly', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith({
        filterBy: {},
        sortBy: expect.any(Array),
        limit: 24,
        offset: 0,
      });
    });

    it('returns source: "db" when Typesense unconfigured', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.source).toBe('db');
    });

    it('logs fallback event with reason: "unconfigured"', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      await discoveryService.getFeed(defaultQuery);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedJson = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedJson.reason).toBe('unconfigured');
      expect(loggedJson.type).toBe('discovery.fallback');
    });
  });

  describe('pagination', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    });

    it('calculates correct offset from page and limit', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      await discoveryService.getFeed({ ...defaultQuery, page: 3, limit: 10 });

      expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20, // (3 - 1) * 10
        }),
      );
    });

    it('returns hasMore true when rows.length equals limit (might have more)', async () => {
      const rows = Array.from({ length: 24 }, (_, i) => postgresRow(`project-${i}`));
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.hasMore).toBe(true);
    });

    it('returns hasMore false when rows.length is less than limit', async () => {
      const rows = [postgresRow('project-1')];
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows });

      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.hasMore).toBe(false);
    });
  });

  describe('logging is fire-and-forget (errors do not propagate)', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    });

    it('continues processing even if logging throws', async () => {
      consoleLogSpy.mockImplementation(() => {
        throw new Error('Logging failure');
      });
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow('project-1')],
      });

      // Should not throw and should return valid result
      const result = await discoveryService.getFeed(defaultQuery);

      expect(result.source).toBe('db');
      expect(result.items).toHaveLength(1);
    });
  });
});
