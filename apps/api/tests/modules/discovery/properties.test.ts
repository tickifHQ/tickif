import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Derivative, DiscoveryFeedResponse } from '@repo/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────────────────────

// Mock the repository
vi.mock('../../../src/modules/discovery/repository.js', () => ({
  discoveryRepository: {
    searchFeed: vi.fn(),
    listFeedFallback: vi.fn(),
    findThemeSlugs: vi.fn(async () => new Map()),
    // Facet counts are densified against this vocabulary; an empty one keeps these
    // property tests focused on filters, sorting and pagination.
    listFacetVocabulary: vi.fn(async () => ({
      citySlug: [],
      localitySlug: [],
      propertyTypeSlug: [],
      propertySubtypeSlug: [],
      scopeSlug: [],
      bhkSlug: [],
      budgetBandSlug: [],
      roomSlugs: [],
      themes: [],
    })),
    countFeedFacets: vi.fn(async () => ({})),
  },
}));

// Mock the mapper. The mocked toDiscoveryCard ignores the resolved label map, so
// collectTaxonomyPairs returns nothing and the batch lookup never hits the database.
vi.mock('../../../src/modules/discovery/mapper.js', () => ({
  collectTaxonomyPairs: vi.fn(() => []),
  normalizeTypesenseHit: vi.fn((hit) => ({
    id: hit.id,
    slug: hit.slug,
    title: hit.title,
    designerName: hit.designerName,
    designerSlug: hit.designerSlug,
    citySlug: hit.citySlug,
    localitySlug: hit.localitySlug,
    bhkSlug: hit.bhkSlug,
    budgetBandSlug: hit.budgetBandSlug,
    themeSlugs: hit.themes,
    avgRating: hit.avgRating ?? 0,
    reviewCount: hit.reviewCount ?? 0,
    coverImageKey: hit.coverImageKey,
    coverImageId: hit.coverImageId ?? null,
    coverImageWidth: hit.coverImageWidth ?? null,
    coverImageHeight: hit.coverImageHeight ?? null,
    coverDerivatives: null,
    coverStatus: hit.coverImageKey ? 'ready' : null,
  })),
  normalizePostgresRow: vi.fn((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    designerName: row.designerName,
    designerSlug: row.designerSlug,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    bhkSlug: row.bhkSlug,
    budgetBandSlug: row.budgetBandSlug,
    themeSlugs: [],
    avgRating: Number(row.avgRating) || 0,
    reviewCount: row.reviewCount,
    coverImageKey: null,
    coverImageId: row.coverImageId,
    coverImageWidth: null,
    coverImageHeight: null,
    coverDerivatives: row.coverDerivatives,
    coverStatus: row.coverStatus,
  })),
  toDiscoveryCard: vi.fn(async (item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    studio: item.designerName,
    city: null,
    locality: null,
    rating: item.avgRating,
    reviewCount: item.reviewCount,
    budget: null,
    tags: [],
    coverImageId: item.coverImageId,
    coverImageUrl: null,
    imageWidth: null,
    imageHeight: null,
  })),
}));

// Mock filter builder
vi.mock('../../../src/modules/discovery/filter-builder.js', () => ({
  buildDiscoveryFilter: vi.fn((filters) => {
    const clauses: string[] = [];
    const filterFields = [
      'citySlug',
      'localitySlug',
      'propertyTypeSlug',
      'propertySubtypeSlug',
      'scopeSlug',
      'bhkSlug',
      'budgetBandSlug',
    ] as const;

    for (const key of filterFields) {
      const value = filters[key as keyof typeof filters];
      if (value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      if (values.length === 0) continue;
      clauses.push(`${key}:[${values.join(',')}]`);
    }
    return clauses.join(' && ');
  }),
}));

// Import AFTER mocks are registered
const { app } = await import('../../../src/app.js');
const { discoveryRepository } = await import('../../../src/modules/discovery/repository.js');

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createTypesenseHit = (
  slug: string,
  publishedAt: number,
  featuredAt: number | null = null,
) => ({
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
  publishedAt,
  featuredAt,
});

const createPostgresRow = (
  slug: string,
  citySlug: string = 'mumbai',
  bhkSlug: string = '3-bhk',
) => ({
  id: `id-${slug}`,
  slug,
  title: `Project ${slug}`,
  designerName: 'Designer Name',
  designerSlug: 'designer-slug',
  citySlug,
  localitySlug: null,
  bhkSlug,
  budgetBandSlug: null,
  avgRating: '4.5',
  reviewCount: 10,
  coverImageId: null,
  coverStatus: 'ready' as const,
  coverDerivatives: [
    { variant: 'small', format: 'webp', key: 'small.webp', width: 640, height: 480 },
  ] as Derivative[],
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 1: Input Validation Correctness
// Validates: Requirements 1.3, 1.4, 1.5, 1.6
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 1: Input Validation Correctness', () => {
  beforeEach(() => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('page validation', () => {
    it.each([
      { page: 0, reason: 'page = 0' },
      { page: -1, reason: 'negative page' },
      { page: -100, reason: 'large negative page' },
    ])('returns 422 when $reason (page=$page)', async ({ page }) => {
      const res = await app.request(`/api/discovery/feed?page=${page}&limit=24&sort=recent`);
      expect(res.status).toBe(422);
    });

    it.each([
      { page: 1, reason: 'minimum valid page' },
      { page: 10, reason: 'mid-range page' },
      { page: 41, reason: 'near-limit page with default limit' },
    ])('returns 200 when $reason (page=$page)', async ({ page }) => {
      const res = await app.request(`/api/discovery/feed?page=${page}&limit=24&sort=recent`);
      expect(res.status).toBe(200);
    });
  });

  describe('limit validation', () => {
    it.each([
      { limit: 0, reason: 'limit = 0' },
      { limit: -1, reason: 'negative limit' },
      { limit: 49, reason: 'limit > 48' },
      { limit: 100, reason: 'limit = 100 (way over)' },
    ])('returns 422 when $reason (limit=$limit)', async ({ limit }) => {
      const res = await app.request(`/api/discovery/feed?page=1&limit=${limit}&sort=recent`);
      expect(res.status).toBe(422);
    });

    it.each([
      { limit: 1, reason: 'minimum valid limit' },
      { limit: 24, reason: 'default limit' },
      { limit: 48, reason: 'maximum valid limit' },
    ])('returns 200 when $reason (limit=$limit)', async ({ limit }) => {
      const res = await app.request(`/api/discovery/feed?page=1&limit=${limit}&sort=recent`);
      expect(res.status).toBe(200);
    });
  });

  describe('sort validation', () => {
    it.each([
      { sort: 'invalid', reason: 'invalid sort value' },
      { sort: 'RECENT', reason: 'uppercase sort value' },
      { sort: 'popularity', reason: 'non-existent sort option' },
      { sort: '', reason: 'empty sort value' },
    ])('returns 422 when $reason (sort=$sort)', async ({ sort }) => {
      const res = await app.request(`/api/discovery/feed?page=1&limit=24&sort=${sort}`);
      expect(res.status).toBe(422);
    });

    it.each([
      { sort: 'recent', reason: 'recent sort' },
      { sort: 'featured', reason: 'featured sort' },
    ])('returns 200 when $reason (sort=$sort)', async ({ sort }) => {
      const res = await app.request(`/api/discovery/feed?page=1&limit=24&sort=${sort}`);
      expect(res.status).toBe(200);
    });

    it('uses default sort (recent) when omitted', async () => {
      const res = await app.request('/api/discovery/feed?page=1&limit=24');
      expect(res.status).toBe(200);
    });
  });

  describe('combined invalid parameters', () => {
    it('returns 422 when page and limit are both invalid', async () => {
      const res = await app.request('/api/discovery/feed?page=0&limit=0&sort=recent');
      expect(res.status).toBe(422);
    });

    it('returns 422 when page invalid even if other params valid', async () => {
      const res = await app.request('/api/discovery/feed?page=-1&limit=24&sort=recent');
      expect(res.status).toBe(422);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 2: Pagination Limit Enforcement
// Validates: Requirements 2.1, 2.2, 2.3, 2.4
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 2: Pagination Limit Enforcement', () => {
  beforeEach(() => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('page × limit boundary tests', () => {
    it.each([
      { page: 42, limit: 24, product: 1008, reason: 'default limit with page 42' },
      { page: 1001, limit: 1, product: 1001, reason: 'page 1001 with limit 1' },
      { page: 21, limit: 48, product: 1008, reason: 'max limit with page 21' },
      { page: 2, limit: 501, product: 1002, reason: 'limit over max (also fails)' },
    ])('returns 422 when page × limit = $product ($reason)', async ({ page, limit }) => {
      const res = await app.request(`/api/discovery/feed?page=${page}&limit=${limit}&sort=recent`);
      expect(res.status).toBe(422);
    });

    it.each([
      { page: 41, limit: 24, product: 984, reason: 'page 41 with default limit (984)' },
      { page: 1000, limit: 1, product: 1000, reason: 'page 1000 with limit 1 (exact boundary)' },
      { page: 20, limit: 48, product: 960, reason: 'page 20 with max limit (960)' },
      { page: 1, limit: 48, product: 48, reason: 'first page with max limit' },
      { page: 25, limit: 40, product: 1000, reason: 'page 25 with limit 40 (exact boundary)' },
    ])('returns 200 when page × limit = $product ($reason)', async ({ page, limit }) => {
      const res = await app.request(`/api/discovery/feed?page=${page}&limit=${limit}&sort=recent`);
      expect(res.status).toBe(200);
    });

    it('exact boundary: page × limit = 1000 succeeds', async () => {
      const res = await app.request('/api/discovery/feed?page=40&limit=25&sort=recent');
      expect(res.status).toBe(200);
    });

    it('exact boundary + 1: page × limit = 1001 fails', async () => {
      // 143 × 7 = 1001
      const res = await app.request('/api/discovery/feed?page=143&limit=7&sort=recent');
      expect(res.status).toBe(422);
    });
  });

  describe('identical behavior for Typesense and Postgres paths', () => {
    it('returns 422 for page × limit > 1000 on Typesense path', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');

      const res = await app.request('/api/discovery/feed?page=42&limit=24&sort=recent');
      expect(res.status).toBe(422);

      // searchFeed should NOT be called because validation happens first
      expect(discoveryRepository.searchFeed).not.toHaveBeenCalled();
    });

    it('returns 422 for page × limit > 1000 on Postgres path', async () => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');

      const res = await app.request('/api/discovery/feed?page=42&limit=24&sort=recent');
      expect(res.status).toBe(422);

      // listFeedFallback should NOT be called because validation happens first
      expect(discoveryRepository.listFeedFallback).not.toHaveBeenCalled();
    });
  });

  describe('error response format for page cap', () => {
    it('returns error with page cap exceeded message', async () => {
      const res = await app.request('/api/discovery/feed?page=42&limit=24&sort=recent');
      expect(res.status).toBe(422);

      const body = await res.json();
      expect(body).toHaveProperty('error');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 3: Sort Order Correctness
// Validates: Requirements 3.3, 3.4, 4.3, 4.4
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 3: Sort Order Correctness', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('TYPESENSE_HOST', '');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleLogSpy.mockRestore();
  });

  describe('recent sort orders by publishedAt descending', () => {
    it('Typesense path uses publishedAt:desc sort', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');

      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      await app.request('/api/discovery/feed?sort=recent');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'publishedAt:desc',
        }),
      );
    });

    it('returns projects in publishedAt descending order', async () => {
      const hits = [
        createTypesenseHit('newer', 1700000002000),
        createTypesenseHit('older', 1700000001000),
      ];

      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits, found: 2 });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;

      expect(body.items[0]!.slug).toBe('newer');
      expect(body.items[1]!.slug).toBe('older');
    });
  });

  describe('featured sort orders by featuredAt desc, then publishedAt desc', () => {
    it('Typesense path uses featuredAt:desc,publishedAt:desc sort', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');

      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000, 1700000000000)],
        found: 1,
      });

      await app.request('/api/discovery/feed?sort=featured');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'featuredAt:desc,publishedAt:desc',
        }),
      );
    });

    it('featured projects (non-null featuredAt) appear before non-featured', async () => {
      const hits = [
        createTypesenseHit('featured-project', 1700000001000, 1700000003000),
        createTypesenseHit('not-featured', 1700000002000, null),
      ];

      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits, found: 2 });

      const res = await app.request('/api/discovery/feed?sort=featured');
      const body = (await res.json()) as DiscoveryFeedResponse;

      // Featured project should be first even with older publishedAt
      expect(body.items[0]!.slug).toBe('featured-project');
      expect(body.items[1]!.slug).toBe('not-featured');
    });
  });

  describe('tie-breaking with identical publishedAt', () => {
    it('handles multiple projects with identical publishedAt', async () => {
      const sameTime = 1700000000000;
      const hits = [
        createTypesenseHit('project-a', sameTime),
        createTypesenseHit('project-b', sameTime),
        createTypesenseHit('project-c', sameTime),
      ];

      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits, found: 3 });

      const res = await app.request('/api/discovery/feed?sort=recent');
      expect(res.status).toBe(200);

      const body = (await res.json()) as DiscoveryFeedResponse;
      // All projects should be returned (order is stable from Typesense)
      expect(body.items).toHaveLength(3);
    });
  });

  describe('featuredAt = null ordering (must appear after non-null)', () => {
    it('projects with featuredAt = null sorted after featured projects', async () => {
      // Simulate Typesense returning in correct order (featured first)
      const hits = [
        createTypesenseHit('featured-2', 1700000001000, 1700000005000),
        createTypesenseHit('featured-1', 1700000002000, 1700000004000),
        createTypesenseHit('not-featured-1', 1700000003000, null),
        createTypesenseHit('not-featured-2', 1700000002500, null),
      ];

      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits, found: 4 });

      const res = await app.request('/api/discovery/feed?sort=featured');
      const body = (await res.json()) as DiscoveryFeedResponse;

      // Featured projects (non-null featuredAt) should be first
      expect(body.items[0]!.slug).toBe('featured-2');
      expect(body.items[1]!.slug).toBe('featured-1');
      // Non-featured projects (null featuredAt) should be last
      expect(body.items[2]!.slug).toBe('not-featured-1');
      expect(body.items[3]!.slug).toBe('not-featured-2');
    });
  });

  describe('identical ordering for Typesense and Postgres paths', () => {
    it('both paths use equivalent sort logic for recent', async () => {
      // Postgres path
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      await app.request('/api/discovery/feed?sort=recent');

      expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: expect.any(Array), // Drizzle order expressions
        }),
      );
    });

    it('both paths use equivalent sort logic for featured', async () => {
      // Postgres path
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      await app.request('/api/discovery/feed?sort=featured');

      expect(discoveryRepository.listFeedFallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: expect.any(Array), // Drizzle order expressions including NULLS LAST
        }),
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 4: Filter AND/OR Semantics
// Validates: Requirements 9.8, 9.9
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 4: Filter AND/OR Semantics', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('TYPESENSE_HOST', 'localhost');
    vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleLogSpy.mockRestore();
  });

  describe('OR logic within single facet (multiple values)', () => {
    it('multiple citySlug values use OR logic', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request('/api/discovery/feed?citySlug=mumbai&citySlug=pune&sort=recent');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringContaining('citySlug:[mumbai,pune]'),
        }),
      );
    });

    it('multiple bhkSlug values use OR logic', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request('/api/discovery/feed?bhkSlug=2-bhk&bhkSlug=3-bhk&sort=recent');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringContaining('bhkSlug:[2-bhk,3-bhk]'),
        }),
      );
    });

    it('single filter value still uses array syntax', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request('/api/discovery/feed?citySlug=mumbai&sort=recent');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringContaining('citySlug:[mumbai]'),
        }),
      );
    });
  });

  describe('AND logic between different facets', () => {
    it('different filter types combined with AND', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request('/api/discovery/feed?citySlug=mumbai&bhkSlug=3-bhk&sort=recent');

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringMatching(/citySlug:\[mumbai\].*&&.*bhkSlug:\[3-bhk\]/),
        }),
      );
    });

    it('three different filters combined with AND', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request(
        '/api/discovery/feed?citySlug=mumbai&bhkSlug=3-bhk&scopeSlug=full-home&sort=recent',
      );

      const call = vi.mocked(discoveryRepository.searchFeed).mock.calls[0]?.[0];
      expect(call?.filterBy).toContain('citySlug:[mumbai]');
      expect(call?.filterBy).toContain('bhkSlug:[3-bhk]');
      expect(call?.filterBy).toContain('scopeSlug:[full-home]');
      expect(call?.filterBy).toContain('&&');
    });

    it('combines OR within facets and AND between facets', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request(
        '/api/discovery/feed?citySlug=mumbai&citySlug=pune&bhkSlug=2-bhk&bhkSlug=3-bhk&sort=recent',
      );

      const call = vi.mocked(discoveryRepository.searchFeed).mock.calls[0]?.[0];
      // Should have OR within each facet
      expect(call?.filterBy).toContain('citySlug:[mumbai,pune]');
      expect(call?.filterBy).toContain('bhkSlug:[2-bhk,3-bhk]');
      // Should have AND between facets
      expect(call?.filterBy).toContain('&&');
    });
  });

  describe('all allowed filter fields', () => {
    it.each([
      { filter: 'citySlug=mumbai', expected: 'citySlug:[mumbai]' },
      { filter: 'localitySlug=bandra', expected: 'localitySlug:[bandra]' },
      { filter: 'propertyTypeSlug=residential', expected: 'propertyTypeSlug:[residential]' },
      { filter: 'propertySubtypeSlug=apartment', expected: 'propertySubtypeSlug:[apartment]' },
      { filter: 'scopeSlug=full-home', expected: 'scopeSlug:[full-home]' },
      { filter: 'bhkSlug=3-bhk', expected: 'bhkSlug:[3-bhk]' },
      { filter: 'budgetBandSlug=20-40-lakh', expected: 'budgetBandSlug:[20-40-lakh]' },
    ])('accepts $filter filter', async ({ filter, expected }) => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request(`/api/discovery/feed?${filter}&sort=recent`);

      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringContaining(expected),
        }),
      );
    });
  });

  describe('unknown filters silently ignored', () => {
    it('unknown filter parameters do not cause errors', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      const res = await app.request(
        '/api/discovery/feed?unknownFilter=value&citySlug=mumbai&sort=recent',
      );

      expect(res.status).toBe(200);
      expect(discoveryRepository.searchFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.stringContaining('citySlug:[mumbai]'),
        }),
      );
    });

    it('unknown filter is not included in filterBy', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      await app.request('/api/discovery/feed?unknownFilter=value&citySlug=mumbai&sort=recent');

      const call = vi.mocked(discoveryRepository.searchFeed).mock.calls[0]?.[0];
      expect(call?.filterBy).not.toContain('unknownFilter');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 5: Response Contract Identity
// Validates: Requirements 6.1, 6.2 (Design Invariant 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 5: Response Contract Identity', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleLogSpy.mockRestore();
  });

  describe('response structure from Typesense path', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    });

    it('returns required response fields with source: search', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;

      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('hasMore');
      expect(body).toHaveProperty('source', 'search');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('items contain all Card_Projection fields', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;
      const item = body.items[0];

      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('coverImageUrl');
      expect(item).toHaveProperty('coverImageId');
      expect(item).toHaveProperty('imageWidth');
      expect(item).toHaveProperty('imageHeight');
      expect(item).toHaveProperty('studio');
      expect(item).toHaveProperty('city');
      expect(item).toHaveProperty('locality');
      expect(item).toHaveProperty('budget');
      expect(item).toHaveProperty('tags');
      expect(item).toHaveProperty('rating');
      expect(item).toHaveProperty('reviewCount');
    });
  });

  describe('response structure from Postgres path', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    });

    it('returns required response fields with source: db', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;

      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('hasMore');
      expect(body).toHaveProperty('source', 'db');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('items contain all Card_Projection fields', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;
      const item = body.items[0];

      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('coverImageUrl');
      expect(item).toHaveProperty('coverImageId');
      expect(item).toHaveProperty('imageWidth');
      expect(item).toHaveProperty('imageHeight');
      expect(item).toHaveProperty('studio');
      expect(item).toHaveProperty('city');
      expect(item).toHaveProperty('locality');
      expect(item).toHaveProperty('budget');
      expect(item).toHaveProperty('tags');
      expect(item).toHaveProperty('rating');
      expect(item).toHaveProperty('reviewCount');
    });
  });

  describe('identical JSON structure except source field', () => {
    it('both paths produce items with identical field set', async () => {
      const typesenseHit = createTypesenseHit('test-project', 1700000000000);
      const postgresRow = createPostgresRow('test-project');

      // Get Typesense response
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [typesenseHit],
        found: 1,
      });

      const typesenseRes = await app.request('/api/discovery/feed?page=1&limit=24&sort=recent');
      const typesenseBody = (await typesenseRes.json()) as DiscoveryFeedResponse;

      // Get Postgres response
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [postgresRow],
      });

      const postgresRes = await app.request('/api/discovery/feed?page=1&limit=24&sort=recent');
      const postgresBody = (await postgresRes.json()) as DiscoveryFeedResponse;

      // Source field should differ
      expect(typesenseBody.source).toBe('search');
      expect(postgresBody.source).toBe('db');

      // All other top-level fields should be same type
      expect(typeof typesenseBody.page).toBe(typeof postgresBody.page);
      expect(typeof typesenseBody.limit).toBe(typeof postgresBody.limit);
      expect(typeof typesenseBody.hasMore).toBe(typeof postgresBody.hasMore);
      expect(Array.isArray(typesenseBody.items)).toBe(Array.isArray(postgresBody.items));

      // Item field sets should be identical
      const typesenseKeys = Object.keys(typesenseBody.items[0]!).sort();
      const postgresKeys = Object.keys(postgresBody.items[0]!).sort();
      expect(typesenseKeys).toEqual(postgresKeys);
    });

    it('pagination metadata is consistent between paths', async () => {
      // Typesense path
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 100,
      });

      const typesenseRes = await app.request('/api/discovery/feed?page=2&limit=10&sort=recent');
      const typesenseBody = (await typesenseRes.json()) as DiscoveryFeedResponse;

      expect(typesenseBody.page).toBe(2);
      expect(typesenseBody.limit).toBe(10);

      // Postgres path
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const postgresRes = await app.request('/api/discovery/feed?page=2&limit=10&sort=recent');
      const postgresBody = (await postgresRes.json()) as DiscoveryFeedResponse;

      expect(postgresBody.page).toBe(2);
      expect(postgresBody.limit).toBe(10);
    });
  });

  describe('shared mapper enforcement', () => {
    it('both paths normalize through the same mapper', async () => {
      const { normalizeTypesenseHit, normalizePostgresRow, toDiscoveryCard } =
        await import('../../../src/modules/discovery/mapper.js');

      // Typesense path
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      await app.request('/api/discovery/feed?sort=recent');

      expect(normalizeTypesenseHit).toHaveBeenCalled();
      expect(toDiscoveryCard).toHaveBeenCalled();

      vi.clearAllMocks();

      // Postgres path
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      await app.request('/api/discovery/feed?sort=recent');

      expect(normalizePostgresRow).toHaveBeenCalled();
      expect(toDiscoveryCard).toHaveBeenCalled();
    });
  });

  describe('empty results', () => {
    it('Typesense path returns empty items array for no results', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;

      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.source).toBe('search');
    });

    it('Postgres path returns empty items array for no results', async () => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const body = (await res.json()) as DiscoveryFeedResponse;

      expect(body.items).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.source).toBe('db');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 8: Cache Header Consistency
// Validates: Requirements 8.1, 8.2
// ─────────────────────────────────────────────────────────────────────────────

describe('Property 8: Cache Header Consistency', () => {
  const EXPECTED_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120';
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleLogSpy.mockRestore();
  });

  describe('cache header present on 200 responses from Typesense path', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
    });

    it('sets Cache-Control header on successful Typesense response', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      const res = await app.request('/api/discovery/feed?sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control header on empty Typesense response', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      const res = await app.request('/api/discovery/feed?sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control header with featured sort', async () => {
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('featured-project', 1700000000000, 1700000001000)],
        found: 1,
      });

      const res = await app.request('/api/discovery/feed?sort=featured');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });
  });

  describe('cache header present on 200 responses from Postgres path', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
    });

    it('sets Cache-Control header on successful Postgres response', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const res = await app.request('/api/discovery/feed?sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control header on empty Postgres response', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      const res = await app.request('/api/discovery/feed?sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control header with featured sort on Postgres path', async () => {
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const res = await app.request('/api/discovery/feed?sort=featured');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });
  });

  describe('cache header value exactly matches expected string', () => {
    it('Typesense path: header value is exact match', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const cacheControl = res.headers.get('Cache-Control');

      // Exact string match (no extra whitespace, correct order)
      expect(cacheControl).toBe('public, max-age=30, stale-while-revalidate=120');
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age=30');
      expect(cacheControl).toContain('stale-while-revalidate=120');
    });

    it('Postgres path: header value is exact match', async () => {
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({ rows: [] });

      const res = await app.request('/api/discovery/feed?sort=recent');
      const cacheControl = res.headers.get('Cache-Control');

      // Exact string match (no extra whitespace, correct order)
      expect(cacheControl).toBe('public, max-age=30, stale-while-revalidate=120');
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age=30');
      expect(cacheControl).toContain('stale-while-revalidate=120');
    });
  });

  describe('cache header identical for both paths', () => {
    it('Typesense and Postgres paths return identical Cache-Control headers', async () => {
      // Typesense path
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({
        hits: [createTypesenseHit('project-1', 1700000000000)],
        found: 1,
      });

      const typesenseRes = await app.request('/api/discovery/feed?sort=recent');
      const typesenseCacheControl = typesenseRes.headers.get('Cache-Control');

      // Postgres path
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const postgresRes = await app.request('/api/discovery/feed?sort=recent');
      const postgresCacheControl = postgresRes.headers.get('Cache-Control');

      // Headers must be identical
      expect(typesenseCacheControl).toBe(postgresCacheControl);
      expect(typesenseCacheControl).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('headers identical regardless of sort parameter', async () => {
      // Typesense with recent sort
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });

      const recentRes = await app.request('/api/discovery/feed?sort=recent');
      const featuredRes = await app.request('/api/discovery/feed?sort=featured');

      expect(recentRes.headers.get('Cache-Control')).toBe(featuredRes.headers.get('Cache-Control'));
      expect(recentRes.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });
  });

  describe('cache header set regardless of filter/sort params', () => {
    beforeEach(() => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');
      vi.mocked(discoveryRepository.searchFeed).mockResolvedValue({ hits: [], found: 0 });
    });

    it('sets Cache-Control with citySlug filter', async () => {
      const res = await app.request('/api/discovery/feed?citySlug=mumbai&sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control with multiple filters', async () => {
      const res = await app.request(
        '/api/discovery/feed?citySlug=mumbai&bhkSlug=3-bhk&scopeSlug=full-home&sort=recent',
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control with pagination params', async () => {
      const res = await app.request('/api/discovery/feed?page=5&limit=10&sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control with all params combined', async () => {
      const res = await app.request(
        '/api/discovery/feed?page=2&limit=12&sort=featured&citySlug=mumbai&bhkSlug=2-bhk',
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });

    it('sets Cache-Control with multiple values for same filter', async () => {
      const res = await app.request(
        '/api/discovery/feed?citySlug=mumbai&citySlug=pune&sort=recent',
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });
  });

  describe('cache header on fallback after Typesense error', () => {
    it('sets Cache-Control when falling back to Postgres after Typesense error', async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-key');

      // Typesense fails, triggering fallback
      vi.mocked(discoveryRepository.searchFeed).mockRejectedValue(new Error('Typesense timeout'));
      vi.mocked(discoveryRepository.listFeedFallback).mockResolvedValue({
        rows: [createPostgresRow('project-1')],
      });

      const res = await app.request('/api/discovery/feed?sort=recent');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(EXPECTED_CACHE_CONTROL);
    });
  });
});
