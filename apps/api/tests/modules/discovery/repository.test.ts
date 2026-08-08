import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectSearchDocument } from '@repo/search';
import type { SearchResponse } from 'typesense/lib/Typesense/Documents.js';
import type { DiscoverySortPostgres } from '../../../src/modules/discovery/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup for @repo/search
// ─────────────────────────────────────────────────────────────────────────────

const mockSearch = vi.fn();
const mockSearchClient = {
  collections: vi.fn(() => ({
    documents: vi.fn(() => ({
      search: mockSearch,
    })),
  })),
};

vi.mock('@repo/search', () => ({
  PROJECT_QUERY_BY: ['title'],
  searchClient: vi.fn(() => mockSearchClient),
  searchCollectionName: vi.fn((name: string) => `${name}_alias`),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup for @repo/db
//
// Testing Drizzle query builders in unit tests is complex due to the chained
// fluent API. For this unit test, we mock the entire query chain to verify
// the method is called with expected parameters.
//
// Full query correctness (actual SQL, joins, filters) is validated in
// integration tests against a real database.
// ─────────────────────────────────────────────────────────────────────────────

const mockQueryResult = vi.fn();

// Create a mock query builder that tracks method calls
const createMockQueryBuilder = () => {
  const builder = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockImplementation(async () => mockQueryResult()),
  };
  return builder;
};

let mockBuilder: ReturnType<typeof createMockQueryBuilder>;

vi.mock('@repo/db', () => ({
  db: {
    select: vi.fn(() => mockBuilder),
  },
  schema: {
    project: {
      id: 'project.id',
      slug: 'project.slug',
      title: 'project.title',
      citySlug: 'project.citySlug',
      bhkSlug: 'project.bhkSlug',
      localitySlug: 'project.localitySlug',
      propertyTypeSlug: 'project.propertyTypeSlug',
      propertySubtypeSlug: 'project.propertySubtypeSlug',
      scopeSlug: 'project.scopeSlug',
      budgetBandSlug: 'project.budgetBandSlug',
      status: 'project.status',
      designerId: 'project.designerId',
      coverImageId: 'project.coverImageId',
      publishedAt: 'project.publishedAt',
      featuredAt: 'project.featuredAt',
    },
    designerProfile: {
      id: 'designerProfile.id',
      displayName: 'designerProfile.displayName',
      status: 'designerProfile.status',
      orgId: 'designerProfile.orgId',
      avgRating: 'designerProfile.avgRating',
      reviewCount: 'designerProfile.reviewCount',
    },
    organization: {
      id: 'organization.id',
      slug: 'organization.slug',
    },
    projectImage: {
      id: 'projectImage.id',
      status: 'projectImage.status',
      derivatives: 'projectImage.derivatives',
      projectId: 'projectImage.projectId',
      themeSlugs: 'projectImage.themeSlugs',
    },
    projectRoom: {
      id: 'projectRoom.id',
      projectId: 'projectRoom.projectId',
      roomTypeId: 'projectRoom.roomTypeId',
    },
    taxonomy: {
      id: 'taxonomy.id',
      kind: 'taxonomy.kind',
      slug: 'taxonomy.slug',
    },
  },
  eq: vi.fn((a, b) => ({ type: 'eq', left: a, right: b })),
  and: vi.fn((...args) => ({ type: 'and', conditions: args })),
  inArray: vi.fn((col, values) => ({ type: 'inArray', column: col, values })),
  exists: vi.fn((query) => ({ type: 'exists', query })),
  or: vi.fn((...args) => ({ type: 'or', conditions: args })),
  desc: vi.fn((column) => ({ type: 'desc', column })),
  sql: vi.fn(),
}));

vi.mock('drizzle-orm/pg-core', () => ({
  alias: vi.fn((table, aliasName) => ({ ...table, alias: aliasName })),
}));

// Import AFTER mocks are registered
const { discoveryRepository } = await import('../../../src/modules/discovery/repository.js');
const { searchClient, searchCollectionName } = await import('@repo/search');
const { db, inArray } = await import('@repo/db');

// Mock sort value for Postgres path tests
// The actual sort logic is tested in integration tests
const mockSortBy = [
  { type: 'desc', column: 'publishedAt' },
  { type: 'desc', column: 'id' },
] as unknown as DiscoverySortPostgres;

beforeEach(() => {
  vi.clearAllMocks();
  mockBuilder = createMockQueryBuilder();
});

// ─────────────────────────────────────────────────────────────────────────────
// searchFeed Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('discoveryRepository.searchFeed', () => {
  const mockHit = (doc: Partial<ProjectSearchDocument>): { document: ProjectSearchDocument } => ({
    document: {
      id: 'project-1',
      slug: 'test-project',
      title: 'Test Project',
      designerSlug: 'designer-1',
      designerName: 'Test Designer',
      citySlug: 'mumbai',
      bhkSlug: '3-bhk',
      coverImageKey: 'covers/test.jpg',
      avgRating: 4.5,
      reviewCount: 10,
      ...doc,
    } as ProjectSearchDocument,
  });

  const mockSearchResponse = (
    hits: Array<{ document: ProjectSearchDocument }>,
    found: number,
  ): SearchResponse<ProjectSearchDocument> =>
    ({
      hits,
      found,
      page: 1,
      request_params: {},
      search_time_ms: 10,
    }) as SearchResponse<ProjectSearchDocument>;

  it('calls searchClient().collections(projectsAlias).documents().search()', async () => {
    mockSearch.mockResolvedValue(mockSearchResponse([mockHit({})], 1));

    await discoveryRepository.searchFeed({
      filterBy: 'citySlug:[mumbai]',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(searchClient).toHaveBeenCalled();
    expect(searchCollectionName).toHaveBeenCalledWith('projects');
    expect(mockSearchClient.collections).toHaveBeenCalledWith('projects_alias');
  });

  it('passes correct search params including minimal projection', async () => {
    mockSearch.mockResolvedValue(mockSearchResponse([mockHit({})], 1));

    await discoveryRepository.searchFeed({
      q: 'calm home',
      filterBy: 'citySlug:[mumbai] && bhkSlug:[3-bhk]',
      sortBy: 'featuredAt:desc,publishedAt:desc',
      page: 2,
      perPage: 12,
    });

    expect(mockSearch).toHaveBeenCalledWith({
      q: 'calm home',
      query_by: 'title',
      filter_by: 'citySlug:[mumbai] && bhkSlug:[3-bhk]',
      sort_by: 'featuredAt:desc,publishedAt:desc',
      facet_by:
        'citySlug,localitySlug,propertyTypeSlug,propertySubtypeSlug,scopeSlug,bhkSlug,budgetBandSlug,roomSlugs,themes',
      page: 2,
      per_page: 12,
      include_fields:
        'id,slug,title,designerSlug,designerName,citySlug,localitySlug,bhkSlug,budgetBandSlug,themes,coverImageKey,coverImageId,coverImageWidth,coverImageHeight,avgRating,reviewCount',
    });
  });

  it('omits filter_by when empty string provided', async () => {
    mockSearch.mockResolvedValue(mockSearchResponse([], 0));

    await discoveryRepository.searchFeed({
      filterBy: '',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        filter_by: undefined,
      }),
    );
  });

  it('maps result.hits to array of documents', async () => {
    const hits = [
      mockHit({ id: 'p1', slug: 'project-1', title: 'Project One' }),
      mockHit({ id: 'p2', slug: 'project-2', title: 'Project Two' }),
    ];
    mockSearch.mockResolvedValue(mockSearchResponse(hits, 50));

    const result = await discoveryRepository.searchFeed({
      filterBy: '',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]).toMatchObject({ id: 'p1', slug: 'project-1', title: 'Project One' });
    expect(result.hits[1]).toMatchObject({ id: 'p2', slug: 'project-2', title: 'Project Two' });
  });

  it('returns found count from result', async () => {
    mockSearch.mockResolvedValue(mockSearchResponse([mockHit({})], 42));

    const result = await discoveryRepository.searchFeed({
      filterBy: '',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(result.found).toBe(42);
  });

  it('handles empty results (hits undefined)', async () => {
    mockSearch.mockResolvedValue({ found: 0, page: 1 } as SearchResponse<ProjectSearchDocument>);

    const result = await discoveryRepository.searchFeed({
      filterBy: 'citySlug:[nonexistent]',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(result.hits).toEqual([]);
    expect(result.found).toBe(0);
  });

  it('handles empty hits array', async () => {
    mockSearch.mockResolvedValue(mockSearchResponse([], 0));

    const result = await discoveryRepository.searchFeed({
      filterBy: '',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(result.hits).toEqual([]);
    expect(result.found).toBe(0);
  });

  it('returns 0 when found is undefined', async () => {
    mockSearch.mockResolvedValue({
      hits: [],
      page: 1,
    } as unknown as SearchResponse<ProjectSearchDocument>);

    const result = await discoveryRepository.searchFeed({
      filterBy: '',
      sortBy: 'publishedAt:desc',
      page: 1,
      perPage: 24,
    });

    expect(result.found).toBe(0);
  });

  describe('minimal projection validation', () => {
    it('requests only Card_Projection fields via include_fields', async () => {
      mockSearch.mockResolvedValue(mockSearchResponse([], 0));

      await discoveryRepository.searchFeed({
        filterBy: '',
        sortBy: 'publishedAt:desc',
        page: 1,
        perPage: 24,
      });

      const searchCall = mockSearch.mock.calls[0]?.[0];
      const includeFields = searchCall?.include_fields?.split(',') ?? [];

      // Verify only required fields are requested (Design Invariant 3)
      const expectedFields = [
        'id',
        'slug',
        'title',
        'designerSlug',
        'designerName',
        'citySlug',
        'localitySlug',
        'bhkSlug',
        'budgetBandSlug',
        'themes',
        'coverImageKey',
        'coverImageId',
        'coverImageWidth',
        'coverImageHeight',
        'avgRating',
        'reviewCount',
      ];

      expect(includeFields).toEqual(expectedFields);
      // Ensure no extra fields are requested
      expect(includeFields).not.toContain('description');
      expect(includeFields).not.toContain('publishedAt');
      expect(includeFields).not.toContain('featuredAt');
      expect(includeFields).not.toContain('propertyTypeSlug');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listFeedFallback Tests
//
// Note: Testing the actual Drizzle query construction in a unit test is complex
// due to the fluent builder pattern. We verify the method is called and the
// query builder chain is executed. Full query correctness (joins, filters, etc.)
// is validated in integration tests against a real database.
// ─────────────────────────────────────────────────────────────────────────────

describe('discoveryRepository.listFeedFallback', () => {
  const mockRow = () => ({
    id: 'project-1',
    slug: 'test-project',
    title: 'Test Project',
    citySlug: 'mumbai',
    localitySlug: 'bandra',
    bhkSlug: '3-bhk',
    budgetBandSlug: '40-60-lakh',
    designerName: 'Test Designer',
    designerSlug: 'designer-1',
    avgRating: '4.5',
    reviewCount: 10,
    coverImageId: 'image-1',
    coverStatus: 'ready' as const,
    coverDerivatives: [
      { variant: 'small', format: 'webp', key: 'test.webp', width: 640, height: 480 },
    ],
  });

  it('returns expected shape { rows: FeedProjectRow[] }', async () => {
    const rows = [mockRow()];
    mockQueryResult.mockResolvedValue(rows);

    const result = await discoveryRepository.listFeedFallback({
      filterBy: {},
      sortBy: mockSortBy,
      limit: 24,
      offset: 0,
    });

    expect(result).toHaveProperty('rows');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows).toEqual(rows);
  });

  it('calls db.select() to initiate query', async () => {
    mockQueryResult.mockResolvedValue([]);

    await discoveryRepository.listFeedFallback({
      filterBy: {},
      sortBy: mockSortBy,
      limit: 24,
      offset: 0,
    });

    expect(db.select).toHaveBeenCalled();
  });

  it('applies limit and offset from params', async () => {
    mockQueryResult.mockResolvedValue([]);

    await discoveryRepository.listFeedFallback({
      filterBy: {},
      sortBy: mockSortBy,
      limit: 12,
      offset: 36,
    });

    expect(mockBuilder.limit).toHaveBeenCalledWith(12);
    expect(mockBuilder.offset).toHaveBeenCalledWith(36);
  });

  it('executes the full query chain (from, innerJoin, leftJoin, where, orderBy, limit, offset)', async () => {
    mockQueryResult.mockResolvedValue([]);

    await discoveryRepository.listFeedFallback({
      filterBy: {},
      sortBy: mockSortBy,
      limit: 24,
      offset: 0,
    });

    // Verify the query chain is called in order
    expect(mockBuilder.from).toHaveBeenCalled();
    expect(mockBuilder.innerJoin).toHaveBeenCalledTimes(2); // designer_profile and organization
    expect(mockBuilder.leftJoin).toHaveBeenCalledTimes(1); // cover image
    expect(mockBuilder.where).toHaveBeenCalled();
    expect(mockBuilder.orderBy).toHaveBeenCalled();
    expect(mockBuilder.limit).toHaveBeenCalled();
    expect(mockBuilder.offset).toHaveBeenCalled();
  });

  it('returns empty rows array when no results', async () => {
    mockQueryResult.mockResolvedValue([]);

    const result = await discoveryRepository.listFeedFallback({
      filterBy: {},
      sortBy: mockSortBy,
      limit: 24,
      offset: 0,
    });

    expect(result.rows).toEqual([]);
  });

  describe('filter clause application', () => {
    it('applies citySlug filter using inArray', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: { citySlug: ['mumbai', 'pune'] },
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      expect(inArray).toHaveBeenCalledWith('project.citySlug', ['mumbai', 'pune']);
    });

    it('applies single value filter by wrapping in array', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: { citySlug: 'mumbai' },
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      expect(inArray).toHaveBeenCalledWith('project.citySlug', ['mumbai']);
    });

    it('applies multiple different filters (AND logic)', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: {
          citySlug: 'mumbai',
          bhkSlug: '3-bhk',
          scopeSlug: 'full-home',
        },
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      expect(inArray).toHaveBeenCalledWith('project.citySlug', ['mumbai']);
      expect(inArray).toHaveBeenCalledWith('project.bhkSlug', ['3-bhk']);
      expect(inArray).toHaveBeenCalledWith('project.scopeSlug', ['full-home']);
    });

    it('applies all allowed filter fields', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: {
          citySlug: 'mumbai',
          localitySlug: 'bandra',
          propertyTypeSlug: 'residential',
          propertySubtypeSlug: 'apartment',
          scopeSlug: 'full-home',
          bhkSlug: '3-bhk',
          budgetBandSlug: 'premium',
        },
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      expect(inArray).toHaveBeenCalledTimes(7);
    });

    it('does not call inArray for undefined filters', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: {
          citySlug: 'mumbai',
          // Other filters undefined
        },
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      // Only called once for citySlug
      expect(inArray).toHaveBeenCalledTimes(1);
    });
  });

  describe('minimal projection validation', () => {
    it('selects only Card_Projection fields', async () => {
      mockQueryResult.mockResolvedValue([]);

      await discoveryRepository.listFeedFallback({
        filterBy: {},
        sortBy: mockSortBy,
        limit: 24,
        offset: 0,
      });

      // db.select is called with a specific projection object
      const selectCall = vi.mocked(db.select).mock.calls[0]?.[0];

      // Verify only the required fields are selected
      expect(selectCall).toBeDefined();
      if (selectCall) {
        const selectedFields = Object.keys(selectCall);
        const expectedFields = [
          'id',
          'slug',
          'title',
          'citySlug',
          'localitySlug',
          'bhkSlug',
          'budgetBandSlug',
          'designerName',
          'designerSlug',
          'avgRating',
          'reviewCount',
          'coverImageId',
          'coverStatus',
          'coverDerivatives',
        ];
        expect(selectedFields).toEqual(expectedFields);

        // Ensure no extra fields are selected
        expect(selectedFields).not.toContain('description');
        expect(selectedFields).not.toContain('publishedAt');
        expect(selectedFields).not.toContain('featuredAt');
        expect(selectedFields).not.toContain('propertyTypeSlug');
      }
    });
  });

  /**
   * Integration tests validate actual query correctness.
   * These tests document what integration tests should verify:
   */
  describe.todo('integration tests should verify', () => {
    it.todo('joins correctly with designer_profile using designerId');
    it.todo('joins correctly with organization using orgId');
    it.todo('left joins cover image using coverImageId');
    it.todo('filters for status = published');
    it.todo('filters for designer status = active');
    it.todo('applies NULLS LAST for featured sort');
    it.todo('returns correct data types for all fields');
  });
});
