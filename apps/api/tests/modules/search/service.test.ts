import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchQuery, DesignerSearchQuery } from '@repo/contracts';

// --- Mocks ---

vi.mock('../../../src/modules/search/repository.js', () => ({
  searchRepository: {
    searchProjects: vi.fn(),
    searchDesigners: vi.fn(),
    multiSearchSuggest: vi.fn(),
    recentPublishedInCity: vi.fn(),
  },
}));

vi.mock('@repo/storage', () => ({
  presignDownload: vi.fn(({ key }: { key: string }) => Promise.resolve(`https://cdn.example.com/${key}`)),
}));

// Import AFTER mock registration
const { searchService } = await import('../../../src/modules/search/service.js');
const { searchRepository } = await import('../../../src/modules/search/repository.js');

beforeEach(() => vi.clearAllMocks());

// --- Factories ---

function makeProjectResult(count = 1) {
  return {
    hits: Array.from({ length: count }, (_, i) => ({
      id: `project-${i}`,
      slug: `project-${i}`,
      title: `Project ${i}`,
      description: null,
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
      themes: ['modern'],
      materials: [],
      finishes: [],
      roomSlugs: [],
      roomLabels: [],
      tags: [],
      coverImageKey: 'derivatives/project/cover.webp',
      publishedAt: 1700000000000,
      featuredAt: null,
    })),
    estimatedTotalHits: count,
    processingTimeMs: 5,
    facetDistribution: { citySlug: { mumbai: count } },
  };
}

function makeEmptyResult() {
  return {
    hits: [],
    estimatedTotalHits: 0,
    processingTimeMs: 2,
    facetDistribution: null,
  };
}

const baseQuery: SearchQuery = {
  q: 'modern living',
  sort: 'relevance',
  page: 1,
  limit: 24,
};

// --- Tests ---

describe('searchService.search', () => {
  it('returns hits with mapped coverImageUrl from presignDownload', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    const result = await searchService.search(baseQuery);

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.coverImageUrl).toBe('https://cdn.example.com/derivatives/project/cover.webp');
    expect(result.fallback).toBe('none');
    expect(result.relaxedFilters).toEqual([]);
  });

  it('forwards page/limit as offset to repository', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    await searchService.search({ ...baseQuery, page: 3, limit: 12 });

    expect(searchRepository.searchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 24, limit: 12 }),
    );
  });

  it('builds filter expression from query params', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    await searchService.search({
      ...baseQuery,
      citySlug: ['mumbai', 'pune'],
      bhkSlug: ['3-bhk'],
    });

    expect(searchRepository.searchProjects).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining('citySlug'),
      }),
    );
  });

  it('strips unknown filter keys (only allowed facets pass through)', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    // Pass an unknown key via type assertion (simulates injection attempt)
    const queryWithUnknown = { ...baseQuery, unknownFacet: ['value'] } as unknown as SearchQuery;
    await searchService.search(queryWithUnknown);

    const call = vi.mocked(searchRepository.searchProjects).mock.calls[0]![0];
    expect(call.filter).not.toContain('unknownFacet');
  });

  it('omits sort when relevance is selected', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    await searchService.search({ ...baseQuery, sort: 'relevance' });

    expect(searchRepository.searchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ sort: [] }),
    );
  });

  it('passes explicit sort to repository', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(1));

    await searchService.search({ ...baseQuery, sort: 'publishedAt:desc' });

    expect(searchRepository.searchProjects).toHaveBeenCalledWith(
      expect.objectContaining({ sort: ['publishedAt:desc'] }),
    );
  });
});

describe('searchService.search — fallback ladder', () => {
  it('drops localitySlug first when zero results', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects)
      .mockResolvedValueOnce(makeEmptyResult()) // initial: zero
      .mockResolvedValueOnce(makeProjectResult(3)); // after dropping localitySlug

    const result = await searchService.search({
      ...baseQuery,
      citySlug: ['mumbai'],
      localitySlug: ['bandra'],
      budgetBandSlug: ['10-20l'],
    });

    expect(result.estimatedTotalHits).toBe(3);
    expect(result.relaxedFilters).toEqual(['localitySlug']);
    expect(result.fallback).toBe('relaxed');
    expect(searchRepository.searchProjects).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it('drops multiple facets in order until results found', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects)
      .mockResolvedValueOnce(makeEmptyResult()) // initial
      .mockResolvedValueOnce(makeEmptyResult()) // after dropping localitySlug
      .mockResolvedValueOnce(makeEmptyResult()) // after dropping budgetBandSlug
      .mockResolvedValueOnce(makeProjectResult(2)); // after dropping themes

    const result = await searchService.search({
      ...baseQuery,
      citySlug: ['mumbai'],
      localitySlug: ['bandra'],
      budgetBandSlug: ['10-20l'],
      themes: ['modern'],
      bhkSlug: ['3-bhk'],
    });

    expect(result.relaxedFilters).toEqual(['localitySlug', 'budgetBandSlug', 'themes']);
    expect(result.fallback).toBe('relaxed');
    consoleSpy.mockRestore();
  });

  it('falls back to Postgres when fallback ladder exhausted', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeEmptyResult());
    vi.mocked(searchRepository.recentPublishedInCity).mockResolvedValue([
      {
        id: 'recent-1',
        slug: 'recent-project',
        title: 'Recent Project',
        description: null,
        designerId: 'designer-1',
        citySlug: 'mumbai',
        publishedAt: new Date('2026-01-01'),
      },
    ]);

    const result = await searchService.search({
      ...baseQuery,
      citySlug: ['mumbai'],
      localitySlug: ['bandra'],
    });

    expect(result.fallback).toBe('recent_in_city');
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.slug).toBe('recent-project');
    expect(searchRepository.recentPublishedInCity).toHaveBeenCalledWith('mumbai', 24);
    consoleSpy.mockRestore();
  });

  it('returns empty when both Meili and Postgres have zero results', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeEmptyResult());
    vi.mocked(searchRepository.recentPublishedInCity).mockResolvedValue([]);

    const result = await searchService.search({
      ...baseQuery,
      citySlug: ['mumbai'],
    });

    expect(result.hits).toHaveLength(0);
    expect(result.estimatedTotalHits).toBe(0);
    expect(result.fallback).toBe('none');
    consoleSpy.mockRestore();
  });

  it('does not trigger fallback ladder when there are no filters', async () => {
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeEmptyResult());

    const result = await searchService.search(baseQuery);

    // Only called once — no fallback iterations
    expect(searchRepository.searchProjects).toHaveBeenCalledTimes(1);
    expect(result.relaxedFilters).toEqual([]);
  });
});

describe('searchService.suggest', () => {
  it('returns blended projects and designers with presigned URLs', async () => {
    vi.mocked(searchRepository.multiSearchSuggest).mockResolvedValue({
      projects: [
        { id: 'p1', slug: 'proj-1', title: 'Project 1', designerName: 'Studio', citySlug: 'mumbai', coverImageKey: 'key/cover.webp' } as never,
      ],
      designers: [
        { id: 'd1', slug: 'designer-1', displayName: 'Studio A', citySlugs: ['mumbai'], logoImageKey: 'key/logo.webp', projectCount: 5 } as never,
      ],
      processingTimeMs: 4,
    });

    const result = await searchService.suggest('modern');

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.coverImageUrl).toBe('https://cdn.example.com/key/cover.webp');
    expect(result.designers).toHaveLength(1);
    expect(result.designers[0]?.logoUrl).toBe('https://cdn.example.com/key/logo.webp');
    expect(result.processingTimeMs).toBe(4);
  });

  it('handles null image keys gracefully', async () => {
    vi.mocked(searchRepository.multiSearchSuggest).mockResolvedValue({
      projects: [
        { id: 'p1', slug: 'proj-1', title: 'Project 1', designerName: 'Studio', citySlug: null, coverImageKey: null } as never,
      ],
      designers: [
        { id: 'd1', slug: null, displayName: 'Studio', citySlugs: [], logoImageKey: null, projectCount: 0 } as never,
      ],
      processingTimeMs: 2,
    });

    const result = await searchService.suggest('test');

    expect(result.projects[0]?.coverImageUrl).toBeNull();
    expect(result.designers[0]?.logoUrl).toBeNull();
  });
});

describe('searchService.searchDesigners', () => {
  it('maps designer hits with presigned logo URLs', async () => {
    vi.mocked(searchRepository.searchDesigners).mockResolvedValue({
      hits: [{
        id: 'd1',
        slug: 'studio-a',
        displayName: 'Studio A',
        bio: 'Design studio',
        entityType: 'individual' as const,
        citySlugs: ['mumbai'],
        localitySlugs: ['bandra'],
        scopeSlugs: ['full-home'],
        themeSlugs: ['modern'],
        yearsExperience: 5,
        projectCount: 12,
        avgRating: 4.5,
        reviewCount: 8,
        logoImageKey: 'originals/logos/d1/logo.png',
        updatedAt: 1700000000000,
      }],
      estimatedTotalHits: 1,
      processingTimeMs: 3,
      facetDistribution: null,
    });

    const query: DesignerSearchQuery = { q: 'studio', sort: 'relevance', page: 1, limit: 24 };
    const result = await searchService.searchDesigners(query);

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.logoUrl).toBe('https://cdn.example.com/originals/logos/d1/logo.png');
    expect(result.hits[0]?.displayName).toBe('Studio A');
  });

  it('builds correct filter for entityType', async () => {
    vi.mocked(searchRepository.searchDesigners).mockResolvedValue({
      hits: [],
      estimatedTotalHits: 0,
      processingTimeMs: 1,
      facetDistribution: null,
    });

    const query: DesignerSearchQuery = {
      q: '',
      citySlugs: ['mumbai'],
      entityType: 'company',
      sort: 'avgRating:desc',
      page: 1,
      limit: 24,
    };
    await searchService.searchDesigners(query);

    expect(searchRepository.searchDesigners).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining('entityType'),
        sort: ['avgRating:desc'],
      }),
    );
  });
});

describe('searchService — logging', () => {
  it('logs search query metrics', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeProjectResult(5));

    await searchService.search(baseQuery);

    expect(consoleSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(logged.type).toBe('search.query');
    expect(logged.q).toBe('modern living');
    expect(logged.hits).toBe(5);
    expect(logged.processingTimeMs).toBe(5);
    consoleSpy.mockRestore();
  });

  it('logs zero-result queries for content-gap analysis', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.mocked(searchRepository.searchProjects).mockResolvedValue(makeEmptyResult());
    vi.mocked(searchRepository.recentPublishedInCity).mockResolvedValue([]);

    await searchService.search({ ...baseQuery, citySlug: ['mumbai'] });

    const calls = consoleSpy.mock.calls.map((c) => JSON.parse(c[0] as string));
    expect(calls.some((c: { type: string }) => c.type === 'search.zero_results')).toBe(true);
    consoleSpy.mockRestore();
  });
});

describe('searchService — error propagation', () => {
  it('propagates Meilisearch errors without triggering Postgres fallback', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const meiliError = new Error('Meilisearch connection refused');
    vi.mocked(searchRepository.searchProjects).mockRejectedValue(meiliError);

    await expect(searchService.search(baseQuery)).rejects.toThrow('Meilisearch connection refused');

    // Postgres fallback must NOT be called
    expect(searchRepository.recentPublishedInCity).not.toHaveBeenCalled();
    // Logger must NOT be called (request failed before reaching logging)
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('propagates suggest errors without swallowing', async () => {
    vi.mocked(searchRepository.multiSearchSuggest).mockRejectedValue(new Error('network timeout'));

    await expect(searchService.suggest('test')).rejects.toThrow('network timeout');
  });

  it('propagates designer search errors without swallowing', async () => {
    vi.mocked(searchRepository.searchDesigners).mockRejectedValue(new Error('index not found'));

    const query: DesignerSearchQuery = { q: '', sort: 'relevance', page: 1, limit: 24 };
    await expect(searchService.searchDesigners(query)).rejects.toThrow('index not found');
  });
});
