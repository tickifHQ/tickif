import type { ProjectSearchDocument } from '@repo/search';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchProjectsResponse } from '@repo/contracts';
import { app } from '../../../src/app.js';

// Mock the repository layer to avoid Typesense dependency
vi.mock('../../../src/modules/search/repository.js', () => ({
  searchProjects: vi.fn(),
  searchDesigners: vi.fn(),
  multiSearch: vi.fn(),
  recentProjectsInCity: vi.fn(),
}));

// Mock storage presigning
vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://cdn.example.com/${key}`),
}));

import * as repository from '../../../src/modules/search/repository.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function get(path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

async function json<T = unknown>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

// Helper to create mock project documents (Typesense format)
function mockProjectDocument(
  overrides: Partial<ProjectSearchDocument> = {},
): ProjectSearchDocument {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'test-project',
    title: 'Test Project',
    description: 'A test project',
    designerId: '22222222-2222-4222-8222-222222222222',
    designerSlug: 'test-studio',
    designerName: 'Test Studio',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    propertyTypeSlug: 'residential',
    propertySubtypeSlug: 'apartment',
    scopeSlug: 'full-home',
    bhkSlug: '3-bhk',
    budgetBandSlug: 'premium',
    sizeSqft: 1500,
    themes: ['modern', 'minimalist'],
    materials: ['wood', 'marble'],
    finishes: ['matte'],
    roomSlugs: ['living-room', 'kitchen'],
    roomLabels: ['Living Room', 'Kitchen'],
    tags: [],
    coverImageKey: 'covers/test.webp',
    publishedAt: Date.now(),
    featuredAt: null,
    avgRating: 4.5,
    reviewCount: 12,
    ...overrides,
  };
}

// Helper to create mock search result
function mockProjectSearchResult(
  hits: ProjectSearchDocument[] = [],
  overrides: Partial<{
    estimatedTotalHits: number;
    facetDistribution: Record<string, Record<string, number>>;
    processingTimeMs: number;
  }> = {},
) {
  return {
    hits,
    estimatedTotalHits: overrides.estimatedTotalHits ?? hits.length,
    facetDistribution: overrides.facetDistribution ?? {
      citySlug: { mumbai: 10, pune: 5 },
      bhkSlug: { '2-bhk': 8, '3-bhk': 7 },
    },
    processingTimeMs: overrides.processingTimeMs ?? 15,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/search — Project Search
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/search', () => {
  describe('basic search with q parameter', () => {
    it('returns search results for a valid query', async () => {
      const doc = mockProjectDocument({ title: 'Modern Living Room' });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?q=modern');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.hits).toHaveLength(1);
      expect(body.hits[0]?.title).toBe('Modern Living Room');
      expect(body.estimatedTotalHits).toBe(1);
      expect(body.facetDistribution).toBeDefined();
      expect(body.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(body.fallback).toBe('none');
      expect(body.relaxedFilters).toEqual([]);
    });

    it('returns empty results when no matches found without filters', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const res = await get('/api/search?q=nonexistent');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.hits).toHaveLength(0);
      expect(body.fallback).toBe('none');
    });

    it('uses default values when no query parameters provided', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const res = await get('/api/search');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(24);
    });

    it('presigns cover image URLs for hits', async () => {
      const doc = mockProjectDocument({ coverImageKey: 'covers/project-123.webp' });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?q=test');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.hits[0]?.coverImageUrl).toBe('https://cdn.example.com/covers/project-123.webp');
    });

    it('returns null coverImageUrl when coverImageKey is null', async () => {
      const doc = mockProjectDocument({ coverImageKey: null });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?q=test');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.hits[0]?.coverImageUrl).toBeNull();
    });

    it('normalizes omitted optional Typesense fields to null', async () => {
      const doc = mockProjectDocument();
      const nullableFields = [
        'description',
        'designerSlug',
        'citySlug',
        'localitySlug',
        'propertyTypeSlug',
        'propertySubtypeSlug',
        'scopeSlug',
        'bhkSlug',
        'budgetBandSlug',
        'sizeSqft',
      ] as const;

      for (const field of nullableFields) Reflect.deleteProperty(doc, field);
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?q=commercial');
      const body = await json<SearchProjectsResponse>(res);

      expect(res.status).toBe(200);
      expect(body.hits[0]).toMatchObject({
        description: null,
        designerSlug: null,
        citySlug: null,
        localitySlug: null,
        propertyTypeSlug: null,
        propertySubtypeSlug: null,
        scopeSlug: null,
        bhkSlug: null,
        budgetBandSlug: null,
        sizeSqft: null,
      });
    });
  });

  describe('filter combinations', () => {
    it('accepts single citySlug filter', async () => {
      const doc = mockProjectDocument({ citySlug: 'mumbai' });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?citySlug=mumbai');

      expect(res.status).toBe(200);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: 'citySlug:=`mumbai`',
        }),
      );
    });

    it('applies OR logic for multiple values of same facet', async () => {
      const doc = mockProjectDocument({ citySlug: 'mumbai' });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?citySlug=mumbai&citySlug=pune');

      expect(res.status).toBe(200);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: 'citySlug:=[`mumbai`, `pune`]',
        }),
      );
    });

    it('applies AND logic across different facets', async () => {
      const doc = mockProjectDocument();
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search?citySlug=mumbai&bhkSlug=3-bhk');

      expect(res.status).toBe(200);
      // Filter builder sorts keys alphabetically
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: 'bhkSlug:=`3-bhk` && citySlug:=`mumbai`',
        }),
      );
    });

    it('combines multiple values and multiple facets correctly', async () => {
      const doc = mockProjectDocument();
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get(
        '/api/search?citySlug=mumbai&citySlug=pune&bhkSlug=3-bhk&themes=modern&themes=minimalist',
      );

      expect(res.status).toBe(200);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by:
            'bhkSlug:=`3-bhk` && citySlug:=[`mumbai`, `pune`] && themes:=[`modern`, `minimalist`]',
        }),
      );
    });

    it('accepts all allowed filter parameters', async () => {
      const doc = mockProjectDocument();
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get(
        '/api/search?citySlug=mumbai&localitySlug=bandra&propertyTypeSlug=residential&propertySubtypeSlug=apartment&scopeSlug=full-home&bhkSlug=3-bhk&budgetBandSlug=premium&themes=modern&materials=wood&finishes=matte&roomSlugs=living-room',
      );

      expect(res.status).toBe(200);
      const callArgs = vi.mocked(repository.searchProjects).mock.calls[0]![0];
      expect(callArgs.filter_by).toContain('citySlug:=`mumbai`');
      expect(callArgs.filter_by).toContain('localitySlug:=`bandra`');
      expect(callArgs.filter_by).toContain('propertyTypeSlug:=`residential`');
      expect(callArgs.filter_by).toContain('bhkSlug:=`3-bhk`');
      expect(callArgs.filter_by).toContain('themes:=`modern`');
    });

    it('silently strips unknown filter keys', async () => {
      const doc = mockProjectDocument({ citySlug: 'mumbai' });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      // unknownFilter should be ignored
      const res = await get('/api/search?citySlug=mumbai&unknownFilter=test');

      expect(res.status).toBe(200);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: 'citySlug:=`mumbai`',
        }),
      );
    });
  });

  describe('pagination', () => {
    it('accepts custom page and limit', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const res = await get('/api/search?page=2&limit=12');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(12);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          per_page: 12,
        }),
      );
    });

    it('rejects limit greater than 48', async () => {
      const res = await get('/api/search?limit=49');
      expect(res.status).toBe(422);
    });

    it('rejects page * limit exceeding 1000', async () => {
      const res = await get('/api/search?page=50&limit=48');
      expect(res.status).toBe(422);
    });

    it('rejects page less than 1', async () => {
      const res = await get('/api/search?page=0');
      expect(res.status).toBe(422);
    });
  });

  describe('sorting', () => {
    it('accepts valid sort options', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const sortOptions = [
        'relevance',
        'publishedAt:desc',
        'publishedAt:asc',
        'sizeSqft:asc',
        'sizeSqft:desc',
      ];

      for (const sort of sortOptions) {
        const res = await get(`/api/search?sort=${sort}`);
        expect(res.status).toBe(200);
      }
    });

    it('uses relevance as default sort', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const res = await get('/api/search');

      expect(res.status).toBe(200);
      expect(repository.searchProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: undefined, // relevance means no sort_by, use ranking rules
        }),
      );
    });

    it('rejects invalid sort option', async () => {
      const res = await get('/api/search?sort=invalid');
      expect(res.status).toBe(422);
    });
  });

  describe('input validation', () => {
    it('rejects q parameter exceeding 200 characters', async () => {
      const longQuery = 'a'.repeat(201);
      const res = await get(`/api/search?q=${longQuery}`);
      expect(res.status).toBe(422);
    });

    it('accepts q parameter at exactly 200 characters', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));
      const maxQuery = 'a'.repeat(200);

      const res = await get(`/api/search?q=${maxQuery}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Cache-Control header', () => {
    it('sets Cache-Control header on successful response', async () => {
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

      const res = await get('/api/search');

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe(
        'public, max-age=30, stale-while-revalidate=120',
      );
    });
  });

  describe('response structure', () => {
    it('returns all required fields in response', async () => {
      const doc = mockProjectDocument();
      vi.mocked(repository.searchProjects).mockResolvedValue(
        mockProjectSearchResult([doc], {
          estimatedTotalHits: 100,
          facetDistribution: { citySlug: { mumbai: 50 } },
          processingTimeMs: 25,
        }),
      );

      const res = await get('/api/search?page=2&limit=10');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);

      // Required response fields
      expect(body).toHaveProperty('hits');
      expect(body).toHaveProperty('estimatedTotalHits');
      expect(body).toHaveProperty('facetDistribution');
      expect(body).toHaveProperty('processingTimeMs');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('fallback');
      expect(body).toHaveProperty('relaxedFilters');

      expect(body.estimatedTotalHits).toBe(100);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
    });

    it('returns all required hit fields', async () => {
      const doc = mockProjectDocument({ publishedAt: 1700000000000 });
      vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

      const res = await get('/api/search');

      expect(res.status).toBe(200);
      const body = await json<SearchProjectsResponse>(res);
      const hit = body.hits[0]!;

      expect(hit).toHaveProperty('id');
      expect(hit).toHaveProperty('slug');
      expect(hit).toHaveProperty('title');
      expect(hit).toHaveProperty('description');
      expect(hit).toHaveProperty('designerId');
      expect(hit).toHaveProperty('designerSlug');
      expect(hit).toHaveProperty('designerName');
      expect(hit).toHaveProperty('citySlug');
      expect(hit).toHaveProperty('localitySlug');
      expect(hit).toHaveProperty('propertyTypeSlug');
      expect(hit).toHaveProperty('scopeSlug');
      expect(hit).toHaveProperty('bhkSlug');
      expect(hit).toHaveProperty('budgetBandSlug');
      expect(hit).toHaveProperty('sizeSqft');
      expect(hit).toHaveProperty('themes');
      expect(hit).toHaveProperty('materials');
      expect(hit).toHaveProperty('finishes');
      expect(hit).toHaveProperty('roomSlugs');
      expect(hit).toHaveProperty('coverImageUrl');
      expect(hit).toHaveProperty('publishedAt');

      // publishedAt should be Unix timestamp in milliseconds
      expect(typeof hit.publishedAt).toBe('number');
      expect(hit.publishedAt).toBe(1700000000000);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Ladder Logic
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/search - Fallback Ladder', () => {
  it('does not execute fallback when initial search returns results', async () => {
    const doc = mockProjectDocument();
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([doc]));

    const res = await get('/api/search?citySlug=mumbai&localitySlug=bandra');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('none');
    expect(body.relaxedFilters).toEqual([]);
    expect(repository.searchProjects).toHaveBeenCalledTimes(1);
  });

  it('does not execute fallback when no filters present', async () => {
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

    const res = await get('/api/search?q=nonexistent');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('none');
    expect(body.relaxedFilters).toEqual([]);
    expect(repository.searchProjects).toHaveBeenCalledTimes(1);
  });

  it('drops localitySlug first in fallback order', async () => {
    const docAfterRelax = mockProjectDocument();
    vi.mocked(repository.searchProjects)
      .mockResolvedValueOnce(mockProjectSearchResult([])) // Initial with all filters
      .mockResolvedValueOnce(mockProjectSearchResult([docAfterRelax])); // After dropping localitySlug

    const res = await get('/api/search?citySlug=mumbai&localitySlug=bandra');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('relaxed');
    expect(body.relaxedFilters).toContain('localitySlug');
    expect(repository.searchProjects).toHaveBeenCalledTimes(2);
  });

  it('drops filters in correct order: localitySlug, budgetBandSlug, themes, bhkSlug', async () => {
    const docAfterRelax = mockProjectDocument();
    vi.mocked(repository.searchProjects)
      .mockResolvedValueOnce(mockProjectSearchResult([])) // Initial
      .mockResolvedValueOnce(mockProjectSearchResult([])) // After dropping localitySlug
      .mockResolvedValueOnce(mockProjectSearchResult([])) // After dropping budgetBandSlug
      .mockResolvedValueOnce(mockProjectSearchResult([])) // After dropping themes
      .mockResolvedValueOnce(mockProjectSearchResult([docAfterRelax])); // After dropping bhkSlug

    const res = await get(
      '/api/search?citySlug=mumbai&localitySlug=bandra&budgetBandSlug=premium&themes=modern&bhkSlug=3-bhk',
    );

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('relaxed');
    expect(body.relaxedFilters).toEqual(['localitySlug', 'budgetBandSlug', 'themes', 'bhkSlug']);
  });

  it('includes only dropped filters in relaxedFilters array', async () => {
    const docAfterRelax = mockProjectDocument();
    vi.mocked(repository.searchProjects)
      .mockResolvedValueOnce(mockProjectSearchResult([])) // Initial
      .mockResolvedValueOnce(mockProjectSearchResult([])) // After dropping localitySlug
      .mockResolvedValueOnce(mockProjectSearchResult([docAfterRelax])); // After dropping budgetBandSlug

    const res = await get('/api/search?citySlug=mumbai&localitySlug=bandra&budgetBandSlug=premium');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('relaxed');
    expect(body.relaxedFilters).toEqual(['localitySlug', 'budgetBandSlug']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Postgres Fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/search - Postgres Fallback', () => {
  it('falls back to Postgres recent projects when Typesense exhausted', async () => {
    // All Typesense searches return empty
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

    // Postgres returns recent projects
    vi.mocked(repository.recentProjectsInCity).mockResolvedValue([
      {
        id: 'pg-1',
        slug: 'recent-project',
        title: 'Recent Project in City',
        description: 'A recent project',
        designerId: 'designer-1',
        designerSlug: 'test-studio',
        designerName: 'Test Studio',
        citySlug: 'mumbai',
        localitySlug: null,
        propertyTypeSlug: 'residential',
        propertySubtypeSlug: 'apartment',
        scopeSlug: 'full-home',
        bhkSlug: '2-bhk',
        budgetBandSlug: 'budget',
        sizeSqft: 1000,
        themes: ['modern'],
        materials: ['wood'],
        finishes: ['matte'],
        roomSlugs: ['living-room'],
        coverImageKey: 'covers/recent.webp',
        publishedAt: new Date('2024-01-15'),
      },
    ]);

    const res = await get(
      '/api/search?citySlug=mumbai&localitySlug=bandra&budgetBandSlug=premium&themes=modern&bhkSlug=3-bhk',
    );

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('recent_in_city');
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0]?.title).toBe('Recent Project in City');
    expect(repository.recentProjectsInCity).toHaveBeenCalledWith('mumbai', 24);
  });

  it('does not trigger Postgres fallback without citySlug', async () => {
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));

    const res = await get('/api/search?localitySlug=bandra&bhkSlug=3-bhk');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.fallback).toBe('none');
    expect(body.hits).toHaveLength(0);
    expect(repository.recentProjectsInCity).not.toHaveBeenCalled();
  });

  it('uses first citySlug when array provided for Postgres fallback', async () => {
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));
    vi.mocked(repository.recentProjectsInCity).mockResolvedValue([]);

    const res = await get('/api/search?citySlug=mumbai&citySlug=pune&localitySlug=bandra');

    expect(res.status).toBe(200);
    expect(repository.recentProjectsInCity).toHaveBeenCalledWith('mumbai', 24);
  });

  it('converts Postgres Date to Unix timestamp in ms', async () => {
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));
    vi.mocked(repository.recentProjectsInCity).mockResolvedValue([
      {
        id: 'pg-1',
        slug: 'recent-project',
        title: 'Recent Project',
        description: null,
        designerId: 'designer-1',
        designerSlug: null,
        designerName: 'Studio',
        citySlug: 'mumbai',
        localitySlug: null,
        propertyTypeSlug: null,
        propertySubtypeSlug: null,
        scopeSlug: null,
        bhkSlug: null,
        budgetBandSlug: null,
        sizeSqft: null,
        themes: [],
        materials: [],
        finishes: [],
        roomSlugs: [],
        coverImageKey: null,
        publishedAt: new Date('2024-06-15T12:00:00.000Z'),
      },
    ]);

    const res = await get('/api/search?citySlug=mumbai&localitySlug=bandra');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.hits[0]?.publishedAt).toBe(new Date('2024-06-15T12:00:00.000Z').getTime());
  });

  it('returns empty facetDistribution for Postgres fallback', async () => {
    vi.mocked(repository.searchProjects).mockResolvedValue(mockProjectSearchResult([]));
    vi.mocked(repository.recentProjectsInCity).mockResolvedValue([
      {
        id: 'pg-1',
        slug: 'recent',
        title: 'Recent',
        description: null,
        designerId: 'd1',
        designerSlug: null,
        designerName: 'Studio',
        citySlug: 'mumbai',
        localitySlug: null,
        propertyTypeSlug: null,
        propertySubtypeSlug: null,
        scopeSlug: null,
        bhkSlug: null,
        budgetBandSlug: null,
        sizeSqft: null,
        themes: [],
        materials: [],
        finishes: [],
        roomSlugs: [],
        coverImageKey: null,
        publishedAt: new Date(),
      },
    ]);

    const res = await get('/api/search?citySlug=mumbai&localitySlug=bandra');

    expect(res.status).toBe(200);
    const body = await json<SearchProjectsResponse>(res);
    expect(body.facetDistribution).toEqual({});
  });
});
