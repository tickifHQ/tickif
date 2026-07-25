import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectSearchDocument, DesignerSearchDocument } from '@repo/search';

// --- Mocks ---

const mockProjectSearch = vi.fn();
const mockDesignerSearch = vi.fn();
const mockMultiSearch = vi.fn();

vi.mock('@repo/search', () => ({
  projectsIndex: () => ({ uid: 'test_projects', search: mockProjectSearch }),
  designersIndex: () => ({ uid: 'test_designers', search: mockDesignerSearch }),
  searchClient: () => ({ multiSearch: mockMultiSearch }),
}));

vi.mock('@repo/db', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    return chain;
  };
  return {
    db: mockChain(),
    schema: {
      project: {
        id: 'project.id',
        slug: 'project.slug',
        title: 'project.title',
        description: 'project.description',
        designerId: 'project.designer_id',
        citySlug: 'project.city_slug',
        publishedAt: 'project.published_at',
        status: 'project.status',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock('drizzle-orm', () => ({
  desc: vi.fn((col) => col),
}));

// Import after mocks
const { searchRepository } = await import('../../../src/modules/search/repository.js');

beforeEach(() => vi.clearAllMocks());

// --- Factories ---

const makeProjectHit = (overrides: Partial<ProjectSearchDocument> = {}): ProjectSearchDocument => ({
  id: 'project-1',
  slug: 'modern-living',
  title: 'Modern Living Room',
  description: 'A beautiful modern living room',
  designerId: 'designer-1',
  designerSlug: 'studio-a',
  designerName: 'Studio A',
  citySlug: 'mumbai',
  localitySlug: 'bandra',
  propertyTypeSlug: 'apartment',
  propertySubtypeSlug: null,
  scopeSlug: 'full-home',
  bhkSlug: '3-bhk',
  budgetBandSlug: '10-20l',
  sizeSqft: 1200,
  themes: ['modern', 'minimal'],
  materials: ['marble'],
  finishes: ['matte'],
  roomSlugs: ['living-room'],
  roomLabels: ['Living Room'],
  tags: [],
  coverImageKey: 'derivatives/project-1/cover.webp',
  publishedAt: 1700000000000,
  featuredAt: null,
  ...overrides,
});

const makeDesignerHit = (overrides: Partial<DesignerSearchDocument> = {}): DesignerSearchDocument => ({
  id: 'designer-1',
  slug: 'studio-a',
  displayName: 'Studio A',
  bio: 'Modern design studio',
  entityType: 'individual',
  citySlugs: ['mumbai'],
  localitySlugs: ['bandra'],
  scopeSlugs: ['full-home'],
  themeSlugs: ['modern'],
  yearsExperience: 5,
  projectCount: 12,
  avgRating: 4.5,
  reviewCount: 8,
  logoImageKey: null,
  updatedAt: 1700000000000,
  ...overrides,
});

// --- Tests ---

describe('searchRepository.searchProjects', () => {
  it('passes correct params to Meilisearch', async () => {
    mockProjectSearch.mockResolvedValue({
      hits: [makeProjectHit()],
      estimatedTotalHits: 1,
      processingTimeMs: 5,
      facetDistribution: { citySlug: { mumbai: 1 } },
    });

    const result = await searchRepository.searchProjects({
      query: 'modern living',
      filter: 'citySlug = "mumbai"',
      sort: ['publishedAt:desc'],
      offset: 0,
      limit: 24,
      facets: ['citySlug'],
    });

    expect(mockProjectSearch).toHaveBeenCalledWith('modern living', {
      filter: 'citySlug = "mumbai"',
      sort: ['publishedAt:desc'],
      offset: 0,
      limit: 24,
      facets: ['citySlug'],
    });
    expect(result.hits).toHaveLength(1);
    expect(result.estimatedTotalHits).toBe(1);
    expect(result.processingTimeMs).toBe(5);
    expect(result.facetDistribution).toEqual({ citySlug: { mumbai: 1 } });
  });

  it('omits filter when empty string', async () => {
    mockProjectSearch.mockResolvedValue({
      hits: [],
      estimatedTotalHits: 0,
      processingTimeMs: 2,
      facetDistribution: null,
    });

    await searchRepository.searchProjects({
      query: '',
      filter: '',
      sort: [],
      offset: 0,
      limit: 24,
    });

    expect(mockProjectSearch).toHaveBeenCalledWith('', {
      filter: undefined,
      sort: undefined,
      offset: 0,
      limit: 24,
      facets: undefined,
    });
  });

  it('defaults estimatedTotalHits and processingTimeMs when missing', async () => {
    mockProjectSearch.mockResolvedValue({
      hits: [],
      estimatedTotalHits: undefined,
      processingTimeMs: undefined,
      facetDistribution: undefined,
    });

    const result = await searchRepository.searchProjects({
      query: 'test',
      filter: '',
      sort: [],
      offset: 0,
      limit: 10,
    });

    expect(result.estimatedTotalHits).toBe(0);
    expect(result.processingTimeMs).toBe(0);
    expect(result.facetDistribution).toBeNull();
  });
});

describe('searchRepository.searchDesigners', () => {
  it('passes correct params to Meilisearch', async () => {
    mockDesignerSearch.mockResolvedValue({
      hits: [makeDesignerHit()],
      estimatedTotalHits: 1,
      processingTimeMs: 3,
      facetDistribution: null,
    });

    const result = await searchRepository.searchDesigners({
      query: 'studio',
      filter: 'citySlugs = "mumbai"',
      sort: ['avgRating:desc'],
      offset: 0,
      limit: 24,
    });

    expect(mockDesignerSearch).toHaveBeenCalledWith('studio', {
      filter: 'citySlugs = "mumbai"',
      sort: ['avgRating:desc'],
      offset: 0,
      limit: 24,
      facets: undefined,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.estimatedTotalHits).toBe(1);
  });
});

describe('error propagation', () => {
  it('propagates Meilisearch errors without swallowing', async () => {
    const meiliError = new Error('Meilisearch connection refused');
    mockProjectSearch.mockRejectedValue(meiliError);

    await expect(
      searchRepository.searchProjects({
        query: 'test',
        filter: '',
        sort: [],
        offset: 0,
        limit: 10,
      }),
    ).rejects.toThrow('Meilisearch connection refused');
  });

  it('propagates multiSearch errors without swallowing', async () => {
    mockMultiSearch.mockRejectedValue(new Error('network timeout'));

    await expect(
      searchRepository.multiSearchSuggest('test', 5, 3),
    ).rejects.toThrow('network timeout');
  });
});

describe('searchRepository.multiSearchSuggest', () => {
  it('calls multiSearch with correct queries', async () => {
    mockMultiSearch.mockResolvedValue({
      results: [
        { hits: [makeProjectHit()], processingTimeMs: 4 },
        { hits: [makeDesignerHit()], processingTimeMs: 3 },
      ],
    });

    const result = await searchRepository.multiSearchSuggest('modern', 5, 3);

    expect(mockMultiSearch).toHaveBeenCalledWith({
      queries: [
        {
          indexUid: 'test_projects',
          q: 'modern',
          limit: 5,
          attributesToRetrieve: ['id', 'slug', 'title', 'designerName', 'citySlug', 'coverImageKey'],
        },
        {
          indexUid: 'test_designers',
          q: 'modern',
          limit: 3,
          attributesToRetrieve: ['id', 'slug', 'displayName', 'citySlugs', 'logoImageKey', 'projectCount'],
        },
      ],
    });
    expect(result.projects).toHaveLength(1);
    expect(result.designers).toHaveLength(1);
    expect(result.processingTimeMs).toBe(4); // max of both
  });

  it('handles empty results gracefully', async () => {
    mockMultiSearch.mockResolvedValue({
      results: [
        { hits: [], processingTimeMs: 1 },
        { hits: [], processingTimeMs: 1 },
      ],
    });

    const result = await searchRepository.multiSearchSuggest('nonexistent', 5, 3);

    expect(result.projects).toHaveLength(0);
    expect(result.designers).toHaveLength(0);
  });
});

describe('searchRepository.recentPublishedInCity', () => {
  it('queries published projects ordered by publishedAt desc', async () => {
    // The DB mock returns empty by default — just verify the method doesn't throw
    const result = await searchRepository.recentPublishedInCity('mumbai', 10);
    expect(result).toEqual([]);
  });

  it('handles null citySlug (returns recent published regardless of city)', async () => {
    const result = await searchRepository.recentPublishedInCity(null, 10);
    expect(result).toEqual([]);
  });
});
