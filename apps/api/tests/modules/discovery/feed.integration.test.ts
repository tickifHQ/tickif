/**
 * Integration tests for GET /api/discovery/feed endpoint (E-267).
 *
 * These tests validate the discovery feed endpoint against the real database.
 * Typesense is mocked since it may not be available in the test environment.
 *
 * INFRASTRUCTURE NOTE:
 * If tests fail due to database connection issues (e.g., "database tickif_api_test does not exist"),
 * this is a pre-existing infrastructure issue — not an E-267 regression.
 * Ensure `pnpm infra:up` is running and the test database is migrated.
 *
 * Test Organization:
 * - 9.1: Typesense primary path (mocked)
 * - 9.2: Postgres fallback path (Typesense mocked to throw)
 * - 9.3: Local development without Typesense (env vars cleared)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DiscoveryFeedResponse, Derivative } from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock @repo/search to control Typesense behavior in tests.
 * This allows testing both success and error paths without a real Typesense instance.
 */
const mockSearchClient = vi.fn();

import type * as searchModule from '@repo/search';

vi.mock('@repo/search', async (orig) => ({
  ...(await orig<typeof searchModule>()),
  searchClient: () => ({
    collections: () => ({
      documents: () => ({
        search: mockSearchClient,
      }),
    }),
  }),
  searchCollectionName: (name: string) => `${name}_alias`,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures and Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create an active designer (required for feed visibility). */
const activeDesigner = (overrides: Partial<typeof schema.designerProfile.$inferInsert> = {}) =>
  makeDesigner({
    status: 'active',
    avgRating: '4.50',
    reviewCount: 10,
    ...overrides,
  });

/** Create a published project with common feed requirements. */
async function makePublishedProject(
  designerId: string,
  overrides: Partial<typeof schema.project.$inferInsert> = {},
) {
  return makeProject({
    designerId,
    status: 'published',
    publishedAt: new Date(),
    citySlug: 'mumbai',
    bhkSlug: '3-bhk',
    ...overrides,
  });
}

/** Attach a ready cover image with small derivative. */
async function attachReadyCover(projectId: string) {
  const cover = await makeProjectImage({
    projectId,
    status: 'ready',
    width: 1920,
    height: 1280,
    derivatives: [
      {
        variant: 'small',
        format: 'webp',
        key: `derivatives/${projectId}/small.webp`,
        width: 640,
        height: 427,
      },
      {
        variant: 'thumb',
        format: 'webp',
        key: `derivatives/${projectId}/thumb.webp`,
        width: 320,
        height: 213,
      },
    ] as Derivative[],
  });
  await db
    .update(schema.project)
    .set({ coverImageId: cover.id })
    .where(eq(schema.project.id, projectId));
  return cover;
}

/** Seed required taxonomy terms for feed tests. */
async function seedFeedTaxonomy() {
  const city = await makeTaxonomy({ kind: 'city', slug: 'mumbai', label: 'Mumbai' });
  await makeTaxonomy({ kind: 'bhk', slug: '3-bhk', label: '3 BHK' });
  await makeTaxonomy({ kind: 'bhk', slug: '2-bhk', label: '2 BHK' });
  return city;
}

/** Make a request to the discovery feed endpoint. */
async function getFeed(query = '') {
  const res = await app.request(`/api/discovery/feed${query}`);
  return { res, body: (await res.json()) as DiscoveryFeedResponse };
}

/** Create a Typesense search hit fixture matching ProjectSearchDocument. */
function makeTypesenseHit(
  project: {
    id: string;
    slug: string;
    title: string;
    citySlug: string | null;
    bhkSlug: string | null;
    featuredAt: Date | null;
    publishedAt: Date | null;
  },
  designer: { displayName: string; slug: string | null; avgRating: string; reviewCount: number },
  coverKey?: string,
) {
  return {
    document: {
      id: project.id,
      slug: project.slug,
      title: project.title,
      description: null,
      designerId: 'designer-id',
      designerName: designer.displayName,
      designerSlug: designer.slug,
      citySlug: project.citySlug,
      localitySlug: null,
      propertyTypeSlug: null,
      propertySubtypeSlug: null,
      scopeSlug: null,
      bhkSlug: project.bhkSlug,
      budgetBandSlug: null,
      sizeSqft: null,
      themes: [],
      materials: [],
      finishes: [],
      roomSlugs: [],
      roomLabels: [],
      tags: [],
      coverImageKey: coverKey ?? null,
      avgRating: Number(designer.avgRating),
      reviewCount: designer.reviewCount,
      publishedAt: project.publishedAt?.getTime() ?? Date.now(),
      featuredAt: project.featuredAt?.getTime() ?? null,
    },
  };
}

/** Parse fallback log events from console.log spy. */
function findFallbackLogCall(spy: ReturnType<typeof vi.spyOn>): unknown[] | undefined {
  return spy.mock.calls.find((call: unknown[]) => {
    try {
      const parsed = JSON.parse(call[0] as string);
      return parsed.type === 'discovery.fallback';
    } catch {
      return false;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/discovery/feed - Integration Tests', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9.1: Typesense Primary Path Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('9.1 Typesense primary path', () => {
    beforeEach(async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-api-key');
      // Seed taxonomy since truncateAll() clears it between tests
      // (needed because toDiscoveryCard() resolves labels from Postgres)
      await seedFeedTaxonomy();
    });

    it('returns search results from Typesense with source: "search"', async () => {
      const designer = await activeDesigner({ displayName: 'Search Studio' });
      const org = await db
        .select({ slug: schema.organization.slug })
        .from(schema.organization)
        .where(eq(schema.organization.id, designer.orgId))
        .limit(1);
      const project = await makePublishedProject(designer.id, { title: 'Typesense Project' });

      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(project, {
            displayName: designer.displayName!,
            slug: org[0]?.slug ?? null,
            avgRating: designer.avgRating!,
            reviewCount: designer.reviewCount,
          }),
        ],
        found: 1,
      });

      const { res, body } = await getFeed();

      expect(res.status).toBe(200);
      expect(body.source).toBe('search');
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({
        slug: project.slug,
        title: 'Typesense Project',
        designerName: 'Search Studio',
      });
    });

    it('applies filter parameters correctly', async () => {
      const designer = await activeDesigner();
      const project = await makePublishedProject(designer.id, { citySlug: 'delhi' });

      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(
            { ...project, citySlug: 'delhi' },
            {
              displayName: designer.displayName!,
              slug: null,
              avgRating: designer.avgRating!,
              reviewCount: designer.reviewCount,
            },
          ),
        ],
        found: 1,
      });

      const { res } = await getFeed('?citySlug=delhi');

      expect(res.status).toBe(200);
      // Verify the filter was passed to Typesense
      expect(mockSearchClient).toHaveBeenCalledWith(
        expect.objectContaining({
          filter_by: expect.stringContaining('citySlug'),
        }),
      );
    });

    it('sorts by recent (publishedAt desc) by default', async () => {
      const designer = await activeDesigner();
      const project = await makePublishedProject(designer.id);

      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(project, {
            displayName: designer.displayName!,
            slug: null,
            avgRating: designer.avgRating!,
            reviewCount: designer.reviewCount,
          }),
        ],
        found: 1,
      });

      await getFeed();

      expect(mockSearchClient).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'publishedAt:desc',
        }),
      );
    });

    it('sorts by featured (featuredAt desc, then publishedAt desc)', async () => {
      const designer = await activeDesigner();
      const project = await makePublishedProject(designer.id);

      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(project, {
            displayName: designer.displayName!,
            slug: null,
            avgRating: designer.avgRating!,
            reviewCount: designer.reviewCount,
          }),
        ],
        found: 1,
      });

      await getFeed('?sort=featured');

      expect(mockSearchClient).toHaveBeenCalledWith(
        expect.objectContaining({
          sort_by: 'featuredAt:desc,publishedAt:desc',
        }),
      );
    });

    it('paginates correctly with page and limit', async () => {
      const designer = await activeDesigner();
      const project = await makePublishedProject(designer.id);

      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(project, {
            displayName: designer.displayName!,
            slug: null,
            avgRating: designer.avgRating!,
            reviewCount: designer.reviewCount,
          }),
        ],
        found: 50,
      });

      const { body } = await getFeed('?page=2&limit=10');

      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
      expect(body.hasMore).toBe(true); // 50 found, showing page 2 of 10
      expect(mockSearchClient).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          per_page: 10,
        }),
      );
    });

    it('orders featuredAt = null projects after featured projects', async () => {
      const designer = await activeDesigner();
      const now = new Date();
      const featured = await makePublishedProject(designer.id, {
        title: 'Featured Project',
        featuredAt: now,
      });
      const notFeatured = await makePublishedProject(designer.id, {
        title: 'Regular Project',
        featuredAt: null,
      });

      // Typesense automatically sorts nulls last for optional numeric fields
      mockSearchClient.mockResolvedValue({
        hits: [
          makeTypesenseHit(
            { ...featured, featuredAt: now },
            {
              displayName: designer.displayName!,
              slug: null,
              avgRating: designer.avgRating!,
              reviewCount: designer.reviewCount,
            },
          ),
          makeTypesenseHit(
            { ...notFeatured, featuredAt: null },
            {
              displayName: designer.displayName!,
              slug: null,
              avgRating: designer.avgRating!,
              reviewCount: designer.reviewCount,
            },
          ),
        ],
        found: 2,
      });

      const { body } = await getFeed('?sort=featured');

      expect(body.items).toHaveLength(2);
      expect(body.items[0]?.title).toBe('Featured Project');
      expect(body.items[1]?.title).toBe('Regular Project');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9.2: Postgres Fallback Path Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('9.2 Postgres fallback path', () => {
    beforeEach(async () => {
      vi.stubEnv('TYPESENSE_HOST', 'localhost');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', 'test-api-key');
      // Seed taxonomy since truncateAll() clears it between tests
      await seedFeedTaxonomy();
    });

    it('falls back on Typesense error and returns source: "db"', async () => {
      const designer = await activeDesigner({ displayName: 'Fallback Studio' });
      const project = await makePublishedProject(designer.id, { title: 'Fallback Project' });
      await attachReadyCover(project.id);

      mockSearchClient.mockRejectedValue(new Error('Connection refused'));

      const { res, body } = await getFeed();

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
      expect(body.items.length).toBeGreaterThanOrEqual(1);

      // Find our specific project (other tests may have left data)
      const fallbackProject = body.items.find((item) => item.slug === project.slug);
      expect(fallbackProject).toBeDefined();
      expect(fallbackProject?.designerName).toBe('Fallback Studio');
    });

    it('falls back on Typesense timeout', async () => {
      const designer = await activeDesigner();
      await makePublishedProject(designer.id);

      mockSearchClient.mockRejectedValue(new Error('Request timeout'));

      const { res, body } = await getFeed();

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
    });

    it('produces response shape matching Typesense path', async () => {
      const designer = await activeDesigner({
        displayName: 'Shape Test Studio',
        avgRating: '4.20',
        reviewCount: 5,
      });
      const project = await makePublishedProject(designer.id, { title: 'Shape Test' });
      await attachReadyCover(project.id);

      mockSearchClient.mockRejectedValue(new Error('Typesense error'));

      const { body } = await getFeed();

      // Verify response structure
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('limit');
      expect(body).toHaveProperty('hasMore');
      expect(body).toHaveProperty('source');

      // Verify card structure for the project we created
      const card = body.items.find((item) => item.slug === project.slug);
      expect(card).toBeDefined();
      expect(card).toHaveProperty('slug');
      expect(card).toHaveProperty('title');
      expect(card).toHaveProperty('coverImageUrl');
      expect(card).toHaveProperty('coverImageWidth');
      expect(card).toHaveProperty('coverImageHeight');
      expect(card).toHaveProperty('designerName');
      expect(card).toHaveProperty('designerSlug');
      expect(card).toHaveProperty('city');
      expect(card).toHaveProperty('bhk');
      expect(card).toHaveProperty('ratingSnippet');
    });

    it('logs fallback event with correct structure', async () => {
      const designer = await activeDesigner();
      await makePublishedProject(designer.id);

      mockSearchClient.mockRejectedValue(new Error('Test error reason'));

      await getFeed();

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = findFallbackLogCall(consoleLogSpy);

      expect(logCall).toBeDefined();
      const logEvent = JSON.parse(logCall![0] as string);
      expect(logEvent).toMatchObject({
        type: 'discovery.fallback',
        reason: 'Test error reason',
        endpoint: 'GET /api/discovery/feed',
      });
      expect(logEvent).toHaveProperty('sort');
      expect(logEvent).toHaveProperty('timestamp');
      // Verify ISO 8601 timestamp format
      expect(logEvent.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9.3: Local Development Without Typesense Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('9.3 Local development without Typesense', () => {
    beforeEach(async () => {
      // Clear Typesense env vars to simulate unconfigured state
      vi.stubEnv('TYPESENSE_HOST', '');
      vi.stubEnv('TYPESENSE_SEARCH_API_KEY', '');
      // Re-seed taxonomy since truncateAll() clears it between tests
      await seedFeedTaxonomy();
    });

    it('uses Postgres when TYPESENSE_HOST is not set', async () => {
      const designer = await activeDesigner({ displayName: 'Local Dev Studio' });
      const project = await makePublishedProject(designer.id, { title: 'Local Dev Project' });
      await attachReadyCover(project.id);

      const { res, body } = await getFeed();

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
      // Verify Typesense was not called
      expect(mockSearchClient).not.toHaveBeenCalled();

      const localProject = body.items.find((item) => item.slug === project.slug);
      expect(localProject).toBeDefined();
    });

    it('logs fallback with reason "unconfigured" (not error)', async () => {
      const designer = await activeDesigner();
      await makePublishedProject(designer.id);

      await getFeed();

      const logCall = findFallbackLogCall(consoleLogSpy);

      expect(logCall).toBeDefined();
      const logEvent = JSON.parse(logCall![0] as string);
      expect(logEvent.reason).toBe('unconfigured');
      // This should NOT be logged as an error - just informational
    });

    it('returns functional feed with Postgres only', async () => {
      const designer = await activeDesigner({
        displayName: 'Postgres Only Studio',
        avgRating: '4.80',
        reviewCount: 25,
      });
      const project = await makePublishedProject(designer.id, {
        title: 'Postgres Only Project',
        citySlug: 'mumbai',
        bhkSlug: '3-bhk',
      });
      await attachReadyCover(project.id);

      const { res, body } = await getFeed();

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');

      const pgProject = body.items.find((item) => item.slug === project.slug);
      expect(pgProject).toBeDefined();
      expect(pgProject).toMatchObject({
        title: 'Postgres Only Project',
        designerName: 'Postgres Only Studio',
        city: 'Mumbai',
        bhk: '3 BHK',
        ratingSnippet: '4.8 (25 reviews)',
      });
      // Cover image should be presigned
      expect(pgProject?.coverImageUrl).toContain('X-Amz-Signature=');
      expect(pgProject?.coverImageWidth).toBe(640);
      expect(pgProject?.coverImageHeight).toBe(427);
    });

    it('returns correct structure for empty feed', async () => {
      // Use a filter that won't match any projects
      const { res, body } = await getFeed('?citySlug=nonexistent-city-xyz');

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        items: [],
        page: 1,
        limit: 24,
        hasMore: false,
        source: 'db',
      });
    });

    it('paginates Postgres results correctly', async () => {
      const designer = await activeDesigner();

      // Create multiple projects with unique city slug for isolation
      const uniqueCity = `pagination-city-${Date.now()}`;
      await makeTaxonomy({ kind: 'city', slug: uniqueCity, label: 'Pagination City' });

      for (let i = 0; i < 5; i++) {
        const p = await makePublishedProject(designer.id, {
          title: `Pagination Test ${i}`,
          citySlug: uniqueCity,
          publishedAt: new Date(Date.now() - i * 1000), // Ensure ordering
        });
        await attachReadyCover(p.id);
      }

      const page1 = await getFeed(`?citySlug=${uniqueCity}&page=1&limit=2`);
      expect(page1.res.status).toBe(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(2);
      expect(page1.body.hasMore).toBe(true);

      const page2 = await getFeed(`?citySlug=${uniqueCity}&page=2&limit=2`);
      expect(page2.body.items).toHaveLength(2);
      expect(page2.body.page).toBe(2);
      expect(page2.body.hasMore).toBe(true);

      const page3 = await getFeed(`?citySlug=${uniqueCity}&page=3&limit=2`);
      expect(page3.body.items).toHaveLength(1);
      expect(page3.body.page).toBe(3);
      expect(page3.body.hasMore).toBe(false);
    });

    it('filters by citySlug with Postgres', async () => {
      const designer = await activeDesigner();

      const uniqueCity = `filter-city-${Date.now()}`;
      await makeTaxonomy({ kind: 'city', slug: uniqueCity, label: 'Filter City' });

      const targetProject = await makePublishedProject(designer.id, {
        title: 'Target City Project',
        citySlug: uniqueCity,
      });
      await attachReadyCover(targetProject.id);

      const { body } = await getFeed(`?citySlug=${uniqueCity}`);

      expect(body.source).toBe('db');
      expect(
        body.items.every((item) => {
          // All items should match our filter
          return item.city === 'Filter City';
        }),
      ).toBe(true);
    });

    it('filters by roomSlugs with the real Postgres fallback query', async () => {
      const room = await makeTaxonomy({
        kind: 'room',
        slug: 'living-room',
        label: 'Living Room',
      });
      const designer = await activeDesigner();
      const matching = await makePublishedProject(designer.id, {
        title: 'Fallback Living Room',
      });
      await makePublishedProject(designer.id, { title: 'Fallback Bedroom' });
      await makeProjectRoom({ projectId: matching.id, roomTypeId: room.id });

      const { res, body } = await getFeed('?roomSlugs=living-room');

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
      expect(body.items.map((item) => item.title)).toEqual(['Fallback Living Room']);
    });

    it('filters by themes with the real Postgres fallback query', async () => {
      const designer = await activeDesigner();
      const matching = await makePublishedProject(designer.id, { title: 'Fallback Warm' });
      const nonMatching = await makePublishedProject(designer.id, {
        title: 'Fallback Minimalist',
      });
      await makeProjectImage({
        projectId: matching.id,
        status: 'ready',
        themeSlugs: ['warm'],
      });
      await makeProjectImage({
        projectId: nonMatching.id,
        status: 'ready',
        themeSlugs: ['minimalist'],
      });
      await makeProjectImage({
        projectId: nonMatching.id,
        status: 'processing',
        themeSlugs: ['warm'],
      });

      const { res, body } = await getFeed('?themes=warm');

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
      expect(body.items.map((item) => item.title)).toEqual(['Fallback Warm']);
    });

    it('combines different fallback facets with AND semantics', async () => {
      const designer = await activeDesigner();
      await makePublishedProject(designer.id, {
        title: 'Fallback Mumbai 2 BHK',
        citySlug: 'mumbai',
        bhkSlug: '2-bhk',
      });
      await makePublishedProject(designer.id, {
        title: 'Fallback Mumbai 3 BHK',
        citySlug: 'mumbai',
        bhkSlug: '3-bhk',
      });

      const { res, body } = await getFeed('?citySlug=mumbai&bhkSlug=2-bhk');

      expect(res.status).toBe(200);
      expect(body.source).toBe('db');
      expect(body.items.map((item) => item.title)).toEqual(['Fallback Mumbai 2 BHK']);
    });

    it('rejects malformed taxonomy slugs at the public endpoint boundary', async () => {
      const { res } = await getFeed('?themes=not%20valid');

      expect(res.status).toBe(422);
    });

    it('sorts by featured with NULLS LAST in Postgres', async () => {
      const designer = await activeDesigner();

      const uniqueCity = `featured-sort-city-${Date.now()}`;
      await makeTaxonomy({ kind: 'city', slug: uniqueCity, label: 'Featured Sort City' });

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Create in reverse order to ensure sort is working
      const notFeatured = await makePublishedProject(designer.id, {
        title: 'Not Featured',
        citySlug: uniqueCity,
        featuredAt: null,
        publishedAt: now,
      });
      await attachReadyCover(notFeatured.id);

      const featured = await makePublishedProject(designer.id, {
        title: 'Featured',
        citySlug: uniqueCity,
        featuredAt: yesterday,
        publishedAt: yesterday,
      });
      await attachReadyCover(featured.id);

      const { body } = await getFeed(`?citySlug=${uniqueCity}&sort=featured`);

      expect(body.source).toBe('db');
      // Featured project should come first (featuredAt nulls last)
      const titles = body.items.map((item) => item.title);
      const featuredIndex = titles.indexOf('Featured');
      const notFeaturedIndex = titles.indexOf('Not Featured');

      expect(featuredIndex).toBeLessThan(notFeaturedIndex);
    });

    it('excludes projects from non-active designers', async () => {
      const activeDesignerInstance = await activeDesigner({ displayName: 'Active Designer' });
      const suspendedDesigner = await makeDesigner({
        status: 'suspended',
        displayName: 'Suspended Designer',
      });

      const uniqueCity = `status-filter-city-${Date.now()}`;
      await makeTaxonomy({ kind: 'city', slug: uniqueCity, label: 'Status Filter City' });

      const visibleProject = await makePublishedProject(activeDesignerInstance.id, {
        title: 'Visible Project',
        citySlug: uniqueCity,
      });
      await attachReadyCover(visibleProject.id);

      // This project should not appear because designer is suspended
      await makePublishedProject(suspendedDesigner.id, {
        title: 'Hidden Project',
        citySlug: uniqueCity,
      });

      const { body } = await getFeed(`?citySlug=${uniqueCity}`);

      expect(body.source).toBe('db');
      const titles = body.items.map((item) => item.title);
      expect(titles).toContain('Visible Project');
      expect(titles).not.toContain('Hidden Project');
    });

    it('excludes unpublished projects', async () => {
      const designer = await activeDesigner();

      const uniqueCity = `unpublished-city-${Date.now()}`;
      await makeTaxonomy({ kind: 'city', slug: uniqueCity, label: 'Unpublished City' });

      const publishedProject = await makePublishedProject(designer.id, {
        title: 'Published Project',
        citySlug: uniqueCity,
      });
      await attachReadyCover(publishedProject.id);

      // Create draft and other non-published projects
      await makeProject({
        designerId: designer.id,
        status: 'draft',
        title: 'Draft Project',
        citySlug: uniqueCity,
      });
      await makeProject({
        designerId: designer.id,
        status: 'submitted',
        title: 'Submitted Project',
        citySlug: uniqueCity,
      });

      const { body } = await getFeed(`?citySlug=${uniqueCity}`);

      const titles = body.items.map((item) => item.title);
      expect(titles).toContain('Published Project');
      expect(titles).not.toContain('Draft Project');
      expect(titles).not.toContain('Submitted Project');
    });
  });
});
