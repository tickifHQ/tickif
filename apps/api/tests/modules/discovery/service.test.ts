import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiscoveryFeedQuery } from '@repo/contracts';

// --- Mocks ---

vi.mock('../../../src/modules/search/repository.js', () => ({
  searchRepository: {
    searchProjects: vi.fn(),
  },
}));

vi.mock('../../../src/modules/discovery/repository.js', () => ({
  discoveryRepository: {
    listFeed: vi.fn(),
    findDesignerStats: vi.fn(),
  },
}));

vi.mock('../../../src/modules/projects/repository.js', () => ({
  projectsRepository: {
    findTaxonomyLabels: vi.fn(),
    findLocalityLabels: vi.fn(),
  },
}));

vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(({ key }: { key: string }) => Promise.resolve(`https://cdn.example.com/${key}`)),
}));

vi.mock('@repo/search', () => ({
  searchClient: vi.fn(() => ({})),
}));

// Import AFTER mock registration
const { discoveryService } = await import('../../../src/modules/discovery/service.js');
const { searchRepository } = await import('../../../src/modules/search/repository.js');
const { discoveryRepository } = await import('../../../src/modules/discovery/repository.js');
const { projectsRepository } = await import('../../../src/modules/projects/repository.js');
const { presignDownload } = await import('@repo/storage');

beforeEach(() => vi.clearAllMocks());

// --- Factories ---

function makeMeiliHit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'project-1',
    slug: 'modern-living',
    title: 'Modern Living Room',
    description: null,
    designerId: 'designer-1',
    designerName: 'Studio A',
    designerSlug: 'studio-a',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    propertyTypeSlug: 'apartment',
    propertySubtypeSlug: null,
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    budgetBandSlug: '10-20l',
    sizeSqft: 1200,
    themes: ['modern'],
    materials: [],
    finishes: [],
    roomSlugs: [],
    roomLabels: [],
    tags: [],
    coverImageKey: 'derivatives/project-1/medium.webp',
    publishedAt: 1700000000000,
    featuredAt: null,
    ...overrides,
  };
}

function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'project-1',
    slug: 'modern-living',
    title: 'Modern Living Room',
    designerId: 'designer-1',
    designerName: 'Studio A',
    designerSlug: 'studio-a',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    bhkSlug: '3-bhk',
    budgetBandSlug: '10-20l',
    scopeSlug: 'full-home',
    propertySubtypeSlug: null,
    rating: '4.50',
    reviewCount: 12,
    coverStatus: 'ready',
    coverDerivatives: [
      { variant: 'medium', format: 'webp', key: 'derivatives/project-1/medium.webp', width: 800, height: 600 },
      { variant: 'thumb', format: 'webp', key: 'derivatives/project-1/thumb.webp', width: 320, height: 240 },
    ],
    coverWidth: 1600,
    coverHeight: 1200,
    publishedAt: new Date('2024-01-15T10:00:00Z'),
    featuredAt: null,
    ...overrides,
  };
}

function defaultQuery(overrides: Partial<DiscoveryFeedQuery> = {}): DiscoveryFeedQuery {
  return { sort: 'recent', page: 1, limit: 24, ...overrides };
}

function setupMeiliSuccess(hits = [makeMeiliHit()]) {
  vi.mocked(searchRepository.searchProjects).mockResolvedValue({
    hits,
    estimatedTotalHits: hits.length,
    processingTimeMs: 5,
    facetDistribution: null,
  });
  vi.mocked(discoveryRepository.findDesignerStats).mockResolvedValue(
    new Map([['designer-1', { rating: '4.50', reviewCount: 12 }]]),
  );
  vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
    new Map([['city:mumbai', 'Mumbai'], ['bhk:3-bhk', '3 BHK'], ['budget_band:10-20l', '₹10-20 Lakh'], ['scope:full-home', 'Full Home']]),
  );
  vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(
    new Map([['mumbai:bandra', 'Bandra']]),
  );
}

function setupMeiliFailure(error: Error) {
  vi.mocked(searchRepository.searchProjects).mockRejectedValue(error);
  vi.mocked(discoveryRepository.listFeed).mockResolvedValue([makeDbRow()]);
  vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(
    new Map([['city:mumbai', 'Mumbai'], ['bhk:3-bhk', '3 BHK'], ['budget_band:10-20l', '₹10-20 Lakh'], ['scope:full-home', 'Full Home']]),
  );
  vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(
    new Map([['mumbai:bandra', 'Bandra']]),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discoveryService.feed', () => {
  describe('Meilisearch success path', () => {
    it('returns source="search" when Meili responds successfully', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());
      expect(result.source).toBe('search');
    });

    it('calls searchRepository with empty query, filter, sort, and limit+1', async () => {
      setupMeiliSuccess();
      await discoveryService.feed(defaultQuery({ sort: 'recent', page: 2, limit: 10 }));

      expect(searchRepository.searchProjects).toHaveBeenCalledWith({
        query: '',
        filter: expect.any(String),
        sort: ['publishedAt:desc'],
        offset: 10, // (page 2 - 1) * 10
        limit: 11, // limit + 1
      });
    });

    it('maps featured sort to correct Meili sort array', async () => {
      setupMeiliSuccess();
      await discoveryService.feed(defaultQuery({ sort: 'featured' }));

      expect(searchRepository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({ sort: ['featuredAt:desc', 'publishedAt:desc'] }),
      );
    });

    it('enriches Meili results with designer stats batch lookup', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());

      expect(discoveryRepository.findDesignerStats).toHaveBeenCalledWith(['designer-1']);
      expect(result.items[0]?.rating).toBe(4.5);
      expect(result.items[0]?.reviewCount).toBe(12);
    });

    it('resolves taxonomy labels from batched lookup', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());

      expect(result.items[0]?.city).toBe('Mumbai');
      expect(result.items[0]?.bhk).toBe('3 BHK');
      expect(result.items[0]?.budget).toBe('₹10-20 Lakh');
    });

    it('resolves locality labels from batched lookup', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());

      expect(result.items[0]?.locality).toBe('Bandra');
    });

    it('signs cover image URLs via presignDownload', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());

      expect(presignDownload).toHaveBeenCalledWith({ key: 'derivatives/project-1/medium.webp' });
      expect(result.items[0]?.coverImageUrl).toBe('https://cdn.example.com/derivatives/project-1/medium.webp');
    });

    it('returns null city/locality/bhk when taxonomy lookup misses', async () => {
      vi.mocked(searchRepository.searchProjects).mockResolvedValue({
        hits: [makeMeiliHit()],
        estimatedTotalHits: 1,
        processingTimeMs: 5,
        facetDistribution: null,
      });
      vi.mocked(discoveryRepository.findDesignerStats).mockResolvedValue(
        new Map([['designer-1', { rating: '4.50', reviewCount: 12 }]]),
      );
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery());

      expect(result.items[0]?.city).toBeNull();
      expect(result.items[0]?.locality).toBeNull();
      expect(result.items[0]?.bhk).toBeNull();
    });
  });

  describe('PostgreSQL fallback path', () => {
    it('falls back to Postgres on MeiliSearchCommunicationError', async () => {
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      setupMeiliFailure(error);

      const result = await discoveryService.feed(defaultQuery());

      expect(result.source).toBe('db');
      expect(discoveryRepository.listFeed).toHaveBeenCalled();
    });

    it('falls back on timeout error', async () => {
      const error = new Error('Request timed out');
      setupMeiliFailure(error);

      const result = await discoveryService.feed(defaultQuery());

      expect(result.source).toBe('db');
    });

    it('falls back on ECONNREFUSED', async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:7700');
      setupMeiliFailure(error);

      const result = await discoveryService.feed(defaultQuery());

      expect(result.source).toBe('db');
    });

    it('uses DB row rating/reviewCount directly (no extra stats lookup)', async () => {
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      setupMeiliFailure(error);

      const result = await discoveryService.feed(defaultQuery());

      expect(discoveryRepository.findDesignerStats).not.toHaveBeenCalled();
      expect(result.items[0]?.rating).toBe(4.5);
      expect(result.items[0]?.reviewCount).toBe(12);
    });

    it('logs fallback activation', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      setupMeiliFailure(error);

      await discoveryService.feed(defaultQuery());

      expect(consoleSpy).toHaveBeenCalled();
      const logCall = consoleSpy.mock.calls[0]?.[0];
      const parsed = JSON.parse(logCall as string);
      expect(parsed.type).toBe('discovery.fallback_activated');
      expect(parsed.reason).toBe('connection_error');
      expect(parsed.timestamp).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('returns empty items when Postgres also fails', async () => {
      const meiliError = new Error('connect ECONNREFUSED');
      meiliError.name = 'MeiliSearchCommunicationError';
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(meiliError);
      vi.mocked(discoveryRepository.listFeed).mockRejectedValue(new Error('DB connection lost'));
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery());

      expect(result.source).toBe('db');
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Infrastructure-only fallback (Req 16)', () => {
    it('does NOT fallback for TypeError — propagates as error', async () => {
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(new TypeError('Cannot read properties of null'));

      await expect(discoveryService.feed(defaultQuery())).rejects.toThrow(TypeError);
      expect(discoveryRepository.listFeed).not.toHaveBeenCalled();
    });

    it('does NOT fallback for generic Error without infrastructure markers', async () => {
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(new Error('invalid_filter: unknown attribute'));

      await expect(discoveryService.feed(defaultQuery())).rejects.toThrow('invalid_filter');
      expect(discoveryRepository.listFeed).not.toHaveBeenCalled();
    });

    it('does NOT fallback for RangeError', async () => {
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(new RangeError('Index out of bounds'));

      await expect(discoveryService.feed(defaultQuery())).rejects.toThrow(RangeError);
      expect(discoveryRepository.listFeed).not.toHaveBeenCalled();
    });
  });

  describe('hasMore computation', () => {
    it('sets hasMore=true when results exceed limit', async () => {
      const hits = Array.from({ length: 25 }, (_, i) => makeMeiliHit({ id: `p-${i}`, slug: `p-${i}` }));
      vi.mocked(searchRepository.searchProjects).mockResolvedValue({
        hits,
        estimatedTotalHits: 100,
        processingTimeMs: 5,
        facetDistribution: null,
      });
      vi.mocked(discoveryRepository.findDesignerStats).mockResolvedValue(
        new Map([['designer-1', { rating: '4.50', reviewCount: 12 }]]),
      );
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery({ limit: 24 }));

      expect(result.hasMore).toBe(true);
      expect(result.items).toHaveLength(24); // trimmed from 25
    });

    it('sets hasMore=false when results are within limit', async () => {
      const hits = Array.from({ length: 10 }, (_, i) => makeMeiliHit({ id: `p-${i}`, slug: `p-${i}` }));
      vi.mocked(searchRepository.searchProjects).mockResolvedValue({
        hits,
        estimatedTotalHits: 10,
        processingTimeMs: 5,
        facetDistribution: null,
      });
      vi.mocked(discoveryRepository.findDesignerStats).mockResolvedValue(
        new Map([['designer-1', { rating: '4.50', reviewCount: 12 }]]),
      );
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery({ limit: 24 }));

      expect(result.hasMore).toBe(false);
      expect(result.items).toHaveLength(10);
    });
  });

  describe('Filter extraction', () => {
    it('passes filter expression to Meilisearch', async () => {
      setupMeiliSuccess();
      await discoveryService.feed(defaultQuery({ citySlug: ['mumbai', 'pune'], bhkSlug: ['3-bhk'] }));

      const call = vi.mocked(searchRepository.searchProjects).mock.calls[0]![0];
      // buildFilterExpression produces: (citySlug = "mumbai" OR citySlug = "pune") AND bhkSlug = "3-bhk"
      expect(call.filter).toContain('citySlug');
      expect(call.filter).toContain('mumbai');
      expect(call.filter).toContain('bhkSlug');
    });

    it('strips unknown filter keys silently', async () => {
      setupMeiliSuccess();
      // Adding an unknown key that's not in ALLOWED_PROJECT_FACET_KEYS
      await discoveryService.feed({ ...defaultQuery(), unknownFilter: ['value'] } as unknown as DiscoveryFeedQuery);

      const call = vi.mocked(searchRepository.searchProjects).mock.calls[0]![0];
      expect(call.filter).not.toContain('unknownFilter');
    });
  });

  describe('Cover image derivative selection', () => {
    it('prefers medium+webp derivative', async () => {
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(error);
      vi.mocked(discoveryRepository.listFeed).mockResolvedValue([
        makeDbRow({
          coverDerivatives: [
            { variant: 'thumb', format: 'webp', key: 'thumb.webp', width: 320, height: 240 },
            { variant: 'medium', format: 'webp', key: 'medium.webp', width: 800, height: 600 },
            { variant: 'large', format: 'webp', key: 'large.webp', width: 1600, height: 1200 },
          ],
        }),
      ]);
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery());

      expect(presignDownload).toHaveBeenCalledWith({ key: 'medium.webp' });
      expect(result.items[0]?.imageWidth).toBe(800);
      expect(result.items[0]?.imageHeight).toBe(600);
    });

    it('falls back to thumb when no medium derivative exists', async () => {
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(error);
      vi.mocked(discoveryRepository.listFeed).mockResolvedValue([
        makeDbRow({
          coverDerivatives: [
            { variant: 'thumb', format: 'webp', key: 'thumb.webp', width: 320, height: 240 },
          ],
        }),
      ]);
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery());

      expect(presignDownload).toHaveBeenCalledWith({ key: 'thumb.webp' });
      expect(result.items[0]?.imageWidth).toBe(320);
    });

    it('returns null cover when status is not ready', async () => {
      const error = new Error('connect ECONNREFUSED');
      error.name = 'MeiliSearchCommunicationError';
      vi.mocked(searchRepository.searchProjects).mockRejectedValue(error);
      vi.mocked(discoveryRepository.listFeed).mockResolvedValue([
        makeDbRow({ coverStatus: 'processing', coverDerivatives: [] }),
      ]);
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());

      const result = await discoveryService.feed(defaultQuery());

      expect(presignDownload).not.toHaveBeenCalled();
      expect(result.items[0]?.coverImageUrl).toBeNull();
    });

    it('returns null cover when signing fails', async () => {
      vi.mocked(searchRepository.searchProjects).mockResolvedValue({
        hits: [makeMeiliHit()],
        estimatedTotalHits: 1,
        processingTimeMs: 5,
        facetDistribution: null,
      });
      vi.mocked(discoveryRepository.findDesignerStats).mockResolvedValue(
        new Map([['designer-1', { rating: '4.50', reviewCount: 12 }]]),
      );
      vi.mocked(projectsRepository.findTaxonomyLabels).mockResolvedValue(new Map());
      vi.mocked(projectsRepository.findLocalityLabels).mockResolvedValue(new Map());
      vi.mocked(presignDownload).mockRejectedValue(new Error('S3 unavailable'));

      const result = await discoveryService.feed(defaultQuery());

      expect(result.items[0]?.coverImageUrl).toBeNull();
      // Response still succeeds — signing failure is graceful
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Response shape', () => {
    it('returns correct pagination metadata', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery({ page: 3, limit: 12 }));

      expect(result.page).toBe(3);
      expect(result.limit).toBe(12);
    });

    it('returns items with all expected fields', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());
      const card = result.items[0]!;

      expect(card).toHaveProperty('slug');
      expect(card).toHaveProperty('title');
      expect(card).toHaveProperty('coverImageUrl');
      expect(card).toHaveProperty('imageWidth');
      expect(card).toHaveProperty('imageHeight');
      expect(card).toHaveProperty('designerName');
      expect(card).toHaveProperty('designerSlug');
      expect(card).toHaveProperty('city');
      expect(card).toHaveProperty('locality');
      expect(card).toHaveProperty('bhk');
      expect(card).toHaveProperty('rating');
      expect(card).toHaveProperty('reviewCount');
      expect(card).toHaveProperty('budget');
      expect(card).toHaveProperty('tags');
    });

    it('builds tags from bhk + scope labels', async () => {
      setupMeiliSuccess();
      const result = await discoveryService.feed(defaultQuery());

      expect(result.items[0]?.tags).toEqual(['3 BHK', 'Full Home']);
    });
  });
});
