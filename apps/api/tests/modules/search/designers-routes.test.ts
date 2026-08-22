/**
 * Integration tests for GET /api/search/designers endpoint.
 *
 * These tests verify the designer search HTTP interface including:
 * - Request validation (query params, entityType, pagination)
 * - Response structure (hits, facetDistribution, pagination metadata)
 * - Filter behavior (OR within facets, AND across facets)
 * - Sort options
 * - Cache-Control headers
 * - Error responses (422 validation errors)
 *
 * The Typesense repository is mocked since we test the HTTP layer,
 * not the actual search engine. Unit tests cover filter building.
 *
 * Validates: Requirements 4.1-4.9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignerSearchDocument } from '@repo/search';
import { app } from '../../../src/app.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock the search repository to avoid Typesense dependency
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../src/modules/search/repository.js', () => ({
  searchDesigners: vi.fn(),
  searchProjects: vi.fn(),
  multiSearch: vi.fn(),
  recentProjectsInCity: vi.fn(),
}));

// Mock presignDownload to avoid R2 dependency
vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(({ key }: { key: string }) =>
    Promise.resolve(`https://cdn.example.com/${key}?signed=1`),
  ),
}));

import * as searchRepository from '../../../src/modules/search/repository.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function get(path: string): Promise<Response> {
  return app.request(path, { method: 'GET' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

function makeDesignerDoc(overrides: Partial<DesignerSearchDocument> = {}): DesignerSearchDocument {
  return {
    id: `designer-${Math.random().toString(36).slice(2, 9)}`,
    slug: 'studio-design',
    displayName: 'Studio Design',
    bio: 'Award-winning interior design studio',
    entityType: 'company',
    citySlugs: ['mumbai'],
    localitySlugs: ['bandra'],
    scopeSlugs: ['full-home'],
    themeSlugs: ['modern', 'minimalist'],
    yearsExperience: 10,
    projectCount: 25,
    avgRating: 4.5,
    reviewCount: 12,
    isKycVerified: false,
    kycExpiresAt: 0,
    logoImageKey: 'logos/studio-design.jpg',
    updatedAt: Date.now(),
    ...overrides,
  };
}

function mockSearchDesigners(
  hits: DesignerSearchDocument[],
  options: {
    estimatedTotalHits?: number;
    facetDistribution?: Record<string, Record<string, number>>;
    processingTimeMs?: number;
  } = {},
) {
  vi.mocked(searchRepository.searchDesigners).mockResolvedValue({
    hits,
    estimatedTotalHits: options.estimatedTotalHits ?? hits.length,
    facetDistribution: options.facetDistribution ?? {},
    processingTimeMs: options.processingTimeMs ?? 5,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/search/designers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Basic Search (Requirement 4.1)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('basic search', () => {
    it('returns search results with all required response fields', async () => {
      const designer = makeDesignerDoc();
      mockSearchDesigners([designer], {
        estimatedTotalHits: 1,
        facetDistribution: {
          entityType: { company: 1 },
          citySlugs: { mumbai: 1 },
        },
        processingTimeMs: 5,
      });

      const res = await get('/api/search/designers?q=studio');
      expect(res.status).toBe(200);

      const body = await json(res);
      // Validates: Requirement 4.1 - response contains required fields
      expect(body).toHaveProperty('hits');
      expect(body).toHaveProperty('estimatedTotalHits');
      expect(body).toHaveProperty('facetDistribution');
      expect(body).toHaveProperty('processingTimeMs');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(Array.isArray(body.hits)).toBe(true);
      expect(body.hits).toHaveLength(1);
    });

    it('returns empty hits array when no designers match', async () => {
      mockSearchDesigners([]);

      const res = await get('/api/search/designers?q=nonexistent');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.hits).toEqual([]);
      expect(body.estimatedTotalHits).toBe(0);
    });

    it('uses default values when no query params provided', async () => {
      mockSearchDesigners([]);

      const res = await get('/api/search/designers');
      expect(res.status).toBe(200);

      const body = await json(res);
      // Validates: Requirement 4.6 - defaults: q='', page=1, limit=24, sort='relevance'
      expect(body.page).toBe(1);
      expect(body.limit).toBe(24);

      // Verify the service was called with defaults
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          q: '',
          page: 1,
          per_page: 24,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Filter Parameters (Requirement 4.2, 4.3)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('filter parameters', () => {
    it('accepts citySlugs filter', async () => {
      mockSearchDesigners([makeDesignerDoc({ citySlugs: ['mumbai'] })]);

      const res = await get('/api/search/designers?citySlugs=mumbai');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('citySlugs'),
        }),
      );
    });

    it('accepts localitySlugs filter', async () => {
      mockSearchDesigners([makeDesignerDoc({ localitySlugs: ['bandra'] })]);

      const res = await get('/api/search/designers?localitySlugs=bandra');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('localitySlugs'),
        }),
      );
    });

    it('accepts scopeSlugs filter', async () => {
      mockSearchDesigners([makeDesignerDoc({ scopeSlugs: ['full-home'] })]);

      const res = await get('/api/search/designers?scopeSlugs=full-home');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('scopeSlugs'),
        }),
      );
    });

    it('accepts themeSlugs filter', async () => {
      mockSearchDesigners([makeDesignerDoc({ themeSlugs: ['modern'] })]);

      const res = await get('/api/search/designers?themeSlugs=modern');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('themeSlugs'),
        }),
      );
    });

    it('applies OR logic for multiple values in same facet', async () => {
      // Validates: Requirement 4.3 - OR logic within facet
      mockSearchDesigners([
        makeDesignerDoc({ citySlugs: ['mumbai'] }),
        makeDesignerDoc({ citySlugs: ['pune'] }),
      ]);

      const res = await get('/api/search/designers?citySlugs=mumbai&citySlugs=pune');
      expect(res.status).toBe(200);

      // Verify filter_by uses array syntax for OR
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringMatching(/citySlugs.*mumbai.*pune|citySlugs.*pune.*mumbai/),
        }),
      );
    });

    it('applies AND logic across different facets', async () => {
      mockSearchDesigners([
        makeDesignerDoc({ citySlugs: ['mumbai'], scopeSlugs: ['full-home'] }),
      ]);

      const res = await get('/api/search/designers?citySlugs=mumbai&scopeSlugs=full-home');
      expect(res.status).toBe(200);

      // Verify filter_by contains both filters (AND logic)
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringMatching(/citySlugs.*&&.*scopeSlugs|scopeSlugs.*&&.*citySlugs/),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // entityType Filter (Requirement 4.4, 4.5)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('entityType filter', () => {
    it('filters by entityType=individual', async () => {
      mockSearchDesigners([makeDesignerDoc({ entityType: 'individual' })]);

      const res = await get('/api/search/designers?entityType=individual');
      expect(res.status).toBe(200);

      // Validates: Requirement 4.4 - entityType filtering
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('entityType'),
        }),
      );
    });

    it('filters by entityType=company', async () => {
      mockSearchDesigners([makeDesignerDoc({ entityType: 'company' })]);

      const res = await get('/api/search/designers?entityType=company');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('entityType'),
        }),
      );
    });

    it('returns 422 for invalid entityType value', async () => {
      // Validates: Requirement 4.5 - invalid entityType returns 422
      const res = await get('/api/search/designers?entityType=freelancer');
      expect(res.status).toBe(422);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Pagination (Requirement 4.7)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('accepts page and limit parameters', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?page=2&limit=10');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          per_page: 10,
        }),
      );
    });

    it('returns 422 when pagination window exceeds 1000', async () => {
      // Validates: Requirement 4.7 - page * limit > 1000 returns 422
      const res = await get('/api/search/designers?page=50&limit=25');
      expect(res.status).toBe(422);

      // Validation error is returned (specific message depends on validation hook)
      const body = await json(res);
      expect(body.error).toBeDefined();
    });

    it('allows pagination exactly at the boundary (page * limit = 1000)', async () => {
      mockSearchDesigners([]);

      const res = await get('/api/search/designers?page=25&limit=40');
      expect(res.status).toBe(200);
    });

    it('returns 422 for invalid page value', async () => {
      const res = await get('/api/search/designers?page=0');
      expect(res.status).toBe(422);
    });

    it('returns 422 for limit exceeding max', async () => {
      const res = await get('/api/search/designers?limit=100');
      expect(res.status).toBe(422);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Sort Options (Requirement 4.8)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('sort options', () => {
    it('accepts sort=relevance (default)', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?sort=relevance');
      expect(res.status).toBe(200);

      // relevance uses undefined sort_by (ranking rules)
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: undefined,
        }),
      );
    });

    it('accepts sort=avgRating:desc', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?sort=avgRating:desc');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'avgRating:desc',
        }),
      );
    });

    it('accepts sort=projectCount:desc', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?sort=projectCount:desc');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'projectCount:desc',
        }),
      );
    });

    it('accepts sort=reviewCount:desc', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?sort=reviewCount:desc');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'reviewCount:desc',
        }),
      );
    });

    it('accepts sort=yearsExperience:desc', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers?sort=yearsExperience:desc');
      expect(res.status).toBe(200);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'yearsExperience:desc',
        }),
      );
    });

    it('returns 422 for invalid sort option', async () => {
      // Validates: Requirement 4.8 - invalid sort returns 422
      const res = await get('/api/search/designers?sort=invalidSort');
      expect(res.status).toBe(422);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Response Structure
  // ─────────────────────────────────────────────────────────────────────────────

  describe('response structure', () => {
    it('returns designer hits with all required fields', async () => {
      const designer = makeDesignerDoc({
        id: 'designer-123',
        slug: 'acme-interiors',
        displayName: 'ACME Interiors',
        bio: 'Professional interior design',
        entityType: 'company',
        citySlugs: ['mumbai', 'pune'],
        localitySlugs: ['bandra', 'koregaon-park'],
        scopeSlugs: ['full-home', 'modular-kitchen'],
        themeSlugs: ['modern', 'contemporary'],
        yearsExperience: 15,
        projectCount: 50,
        avgRating: 4.8,
        reviewCount: 25,
        isKycVerified: false,
        logoImageKey: 'logos/acme.png',
      });
      mockSearchDesigners([designer]);

      const res = await get('/api/search/designers?q=acme');
      const body = await json(res);
      const hit = body.hits[0];

      expect(hit).toMatchObject({
        id: 'designer-123',
        slug: 'acme-interiors',
        displayName: 'ACME Interiors',
        bio: 'Professional interior design',
        entityType: 'company',
        citySlugs: ['mumbai', 'pune'],
        localitySlugs: ['bandra', 'koregaon-park'],
        scopeSlugs: ['full-home', 'modular-kitchen'],
        themeSlugs: ['modern', 'contemporary'],
        yearsExperience: 15,
        projectCount: 50,
        avgRating: 4.8,
        reviewCount: 25,
      });
      // logoUrl should be presigned
      expect(hit.logoUrl).toContain('cdn.example.com');
      expect(hit.logoUrl).toContain('signed=1');
    });

    it('returns null logoUrl when logoImageKey is null', async () => {
      const designer = makeDesignerDoc({ logoImageKey: null });
      mockSearchDesigners([designer]);

      const res = await get('/api/search/designers?q=test');
      const body = await json(res);

      expect(body.hits[0].logoUrl).toBeNull();
    });

    it('does not expose an expired search-projection verification flag', async () => {
      mockSearchDesigners([
        makeDesignerDoc({
          isKycVerified: true,
          kycExpiresAt: Date.now() - 1,
        }),
      ]);

      const res = await get('/api/search/designers?q=test');
      const body = await json(res);

      expect(body.hits[0].isKycVerified).toBe(false);
    });

    it('defaults verification to false for a legacy search document without badge fields', async () => {
      const legacyDesigner = makeDesignerDoc();
      delete legacyDesigner.isKycVerified;
      delete legacyDesigner.kycExpiresAt;
      mockSearchDesigners([legacyDesigner]);

      const res = await get('/api/search/designers?q=test');
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.hits[0].isKycVerified).toBe(false);
    });

    it('returns facetDistribution in response', async () => {
      mockSearchDesigners([makeDesignerDoc()], {
        facetDistribution: {
          entityType: { company: 5, individual: 3 },
          citySlugs: { mumbai: 6, delhi: 2 },
          scopeSlugs: { 'full-home': 4, 'modular-kitchen': 4 },
        },
      });

      const res = await get('/api/search/designers');
      const body = await json(res);

      expect(body.facetDistribution).toEqual({
        entityType: { company: 5, individual: 3 },
        citySlugs: { mumbai: 6, delhi: 2 },
        scopeSlugs: { 'full-home': 4, 'modular-kitchen': 4 },
      });
    });

    it('returns processingTimeMs in response', async () => {
      mockSearchDesigners([makeDesignerDoc()], { processingTimeMs: 12 });

      const res = await get('/api/search/designers');
      const body = await json(res);

      expect(body.processingTimeMs).toBe(12);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Cache-Control Header (Requirement 4.9)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Cache-Control header', () => {
    it('includes correct Cache-Control header on successful response', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      const res = await get('/api/search/designers');
      expect(res.status).toBe(200);

      // Validates: Requirement 4.9 - Cache-Control header
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=30, stale-while-revalidate=120',
      );
    });

    it('includes Cache-Control header on empty results', async () => {
      mockSearchDesigners([]);

      const res = await get('/api/search/designers?q=nonexistent');
      expect(res.status).toBe(200);

      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=30, stale-while-revalidate=120',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Input Validation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('returns 422 when q exceeds 200 characters', async () => {
      const longQuery = 'a'.repeat(201);
      const res = await get(`/api/search/designers?q=${longQuery}`);
      expect(res.status).toBe(422);
    });

    it('accepts q with exactly 200 characters', async () => {
      mockSearchDesigners([]);

      const exactQuery = 'a'.repeat(200);
      const res = await get(`/api/search/designers?q=${exactQuery}`);
      expect(res.status).toBe(200);
    });

    it('silently strips unknown filter keys', async () => {
      mockSearchDesigners([makeDesignerDoc()]);

      // unknownFilter should be ignored, not cause an error
      const res = await get('/api/search/designers?unknownFilter=test&citySlugs=mumbai');
      expect(res.status).toBe(200);

      // Only valid filter should be applied
      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('citySlugs'),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Combined Scenarios
  // ─────────────────────────────────────────────────────────────────────────────

  describe('combined scenarios', () => {
    it('handles search with multiple filters, pagination, and sort', async () => {
      mockSearchDesigners(
        [
          makeDesignerDoc({
            entityType: 'company',
            citySlugs: ['mumbai'],
            scopeSlugs: ['full-home'],
          }),
        ],
        { estimatedTotalHits: 15 },
      );

      const res = await get(
        '/api/search/designers?q=interior&entityType=company&citySlugs=mumbai&scopeSlugs=full-home&page=2&limit=10&sort=avgRating:desc',
      );
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
      expect(body.estimatedTotalHits).toBe(15);

      expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'interior',
          page: 2,
          per_page: 10,
          sort_by: 'avgRating:desc',
          filter_by: expect.stringMatching(/citySlugs.*entityType.*scopeSlugs/),
        }),
      );
    });

    it('returns multiple designers sorted by criteria', async () => {
      mockSearchDesigners([
        makeDesignerDoc({ displayName: 'Top Rated', avgRating: 4.9 }),
        makeDesignerDoc({ displayName: 'Second Best', avgRating: 4.7 }),
        makeDesignerDoc({ displayName: 'Third Place', avgRating: 4.5 }),
      ]);

      const res = await get('/api/search/designers?sort=avgRating:desc');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.hits).toHaveLength(3);
    });
  });
});
