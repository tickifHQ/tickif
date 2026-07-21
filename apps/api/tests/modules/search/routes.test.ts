import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchResponse, SuggestResponse, DesignerSearchResponse } from '@repo/contracts';

// --- Mocks ---

vi.mock('../../../src/modules/search/service.js', () => ({
  searchService: {
    search: vi.fn(),
    suggest: vi.fn(),
    searchDesigners: vi.fn(),
  },
}));

vi.mock('../../../src/modules/profiles/service.js', () => ({ profilesService: {} }));
vi.mock('../../../src/modules/profiles/portfolio-service.js', () => ({ portfolioService: {} }));
vi.mock('../../../src/modules/dashboard/service.js', () => ({ dashboardService: {} }));
vi.mock('../../../src/modules/projects/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { projectsRoutes: new OpenAPIHono() };
});
vi.mock('../../../src/modules/media/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { mediaRoutes: new OpenAPIHono(), projectImagesRoutes: new OpenAPIHono() };
});
vi.mock('../../../src/modules/taxonomy/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { taxonomyRoutes: new OpenAPIHono() };
});
vi.mock('../../../src/modules/leads/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { leadsRoutes: new OpenAPIHono() };
});
vi.mock('@repo/auth', () => ({
  getSession: vi.fn(),
  auth: { handler: vi.fn(() => new Response(null, { status: 404 })) },
}));
vi.mock('@repo/config', () => ({
  config: { TRUSTED_ORIGINS: [], NEXT_PUBLIC_API_URL: 'http://localhost:3001' },
  isProduction: false,
}));
vi.mock('../../../src/modules/orgs/repository.js', () => ({
  isOrgWriter: vi.fn(),
  isOrgMember: vi.fn(),
}));

// Import AFTER mocks
const { searchService } = await import('../../../src/modules/search/service.js');
const { app } = await import('../../../src/app.js');

beforeEach(() => vi.clearAllMocks());

// --- Factories ---

const fakeSearchResponse: SearchResponse = {
  hits: [{
    id: 'p1', slug: 'modern-living', title: 'Modern Living', description: null,
    designerId: 'd1', designerSlug: 'studio-a', designerName: 'Studio A',
    citySlug: 'mumbai', localitySlug: 'bandra', propertyTypeSlug: 'apartment',
    bhkSlug: '3-bhk', budgetBandSlug: '10-20l', scopeSlug: 'full-home',
    themes: ['modern'], coverImageUrl: 'https://cdn.test/cover.webp', publishedAt: 1700000000000,
  }],
  estimatedTotalHits: 1,
  facetDistribution: { citySlug: { mumbai: 1 } },
  processingTimeMs: 5,
  page: 1,
  limit: 24,
  relaxedFilters: [],
  fallback: 'none',
};

const fakeSuggestResponse: SuggestResponse = {
  projects: [{ id: 'p1', slug: 'proj', title: 'Project', designerName: 'Studio', citySlug: 'mumbai', coverImageUrl: null }],
  designers: [{ id: 'd1', slug: 'studio', displayName: 'Studio A', citySlugs: ['mumbai'], logoUrl: null, projectCount: 5 }],
  processingTimeMs: 3,
};

const fakeDesignerResponse: DesignerSearchResponse = {
  hits: [{
    id: 'd1', slug: 'studio-a', displayName: 'Studio A', bio: null,
    entityType: 'individual', citySlugs: ['mumbai'], scopeSlugs: ['full-home'],
    yearsExperience: 5, projectCount: 12, avgRating: 4.5, reviewCount: 8, logoUrl: null,
  }],
  estimatedTotalHits: 1,
  facetDistribution: null,
  processingTimeMs: 3,
  page: 1,
  limit: 24,
};

// --- Helpers ---

async function get(path: string) {
  // Route is mounted at /api/search with path '/', so full URL is /api/search (no trailing slash)
  const url = path.startsWith('/') ? `/api/search${path}` : `/api/search?${path}`;
  return app.request(url, { method: 'GET' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

// --- Tests ---

describe('GET /api/search', () => {
  it('returns 200 with search results', async () => {
    vi.mocked(searchService.search).mockResolvedValue(fakeSearchResponse);

    const res = await get('q=modern');

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits).toHaveLength(1);
    expect(body.estimatedTotalHits).toBe(1);
    expect(body.fallback).toBe('none');
  });

  it('sets Cache-Control header', async () => {
    vi.mocked(searchService.search).mockResolvedValue(fakeSearchResponse);

    const res = await get('q=test');

    expect(res.headers.get('cache-control')).toBe('public, max-age=30, stale-while-revalidate=120');
  });

  it('coerces repeated query params into arrays', async () => {
    vi.mocked(searchService.search).mockResolvedValue(fakeSearchResponse);

    await get('q=test&citySlug=mumbai&citySlug=pune');

    const call = vi.mocked(searchService.search).mock.calls[0]![0];
    expect(call.citySlug).toEqual(['mumbai', 'pune']);
  });

  it('coerces single query param into array', async () => {
    vi.mocked(searchService.search).mockResolvedValue(fakeSearchResponse);

    await get('q=test&citySlug=mumbai');

    const call = vi.mocked(searchService.search).mock.calls[0]![0];
    expect(call.citySlug).toEqual(['mumbai']);
  });

  it('returns 422 when page * limit exceeds 1000', async () => {
    const res = await get('page=22&limit=48');

    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 422 for invalid sort option', async () => {
    const res = await get('sort=invalid');

    expect(res.status).toBe(422);
  });

  it('applies defaults when no params provided', async () => {
    vi.mocked(searchService.search).mockResolvedValue(fakeSearchResponse);

    await get('');

    const call = vi.mocked(searchService.search).mock.calls[0]![0];
    expect(call.q).toBe('');
    expect(call.page).toBe(1);
    expect(call.limit).toBe(24);
    expect(call.sort).toBe('relevance');
  });
});

describe('GET /api/search/suggest', () => {
  it('returns 200 with blended results', async () => {
    vi.mocked(searchService.suggest).mockResolvedValue(fakeSuggestResponse);

    const res = await get('/suggest?q=modern');

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.projects).toHaveLength(1);
    expect(body.designers).toHaveLength(1);
  });

  it('sets Cache-Control header', async () => {
    vi.mocked(searchService.suggest).mockResolvedValue(fakeSuggestResponse);

    const res = await get('/suggest?q=test');

    expect(res.headers.get('cache-control')).toBe('public, max-age=30, stale-while-revalidate=120');
  });

  it('returns 422 when q is missing', async () => {
    const res = await get('/suggest');

    expect(res.status).toBe(422);
  });

  it('returns 422 when q is empty', async () => {
    const res = await get('/suggest?q=');

    expect(res.status).toBe(422);
  });
});

describe('GET /api/search/designers', () => {
  it('returns 200 with designer results', async () => {
    vi.mocked(searchService.searchDesigners).mockResolvedValue(fakeDesignerResponse);

    const res = await get('/designers?q=studio');

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0].displayName).toBe('Studio A');
  });

  it('sets Cache-Control header', async () => {
    vi.mocked(searchService.searchDesigners).mockResolvedValue(fakeDesignerResponse);

    const res = await get('/designers?q=test');

    expect(res.headers.get('cache-control')).toBe('public, max-age=30, stale-while-revalidate=120');
  });

  it('returns 422 when page * limit exceeds 1000', async () => {
    const res = await get('/designers?page=30&limit=48');

    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe('validation_error');
  });

  it('coerces repeated designer filter params into arrays', async () => {
    vi.mocked(searchService.searchDesigners).mockResolvedValue(fakeDesignerResponse);

    await get('/designers?citySlugs=mumbai&citySlugs=pune');

    const call = vi.mocked(searchService.searchDesigners).mock.calls[0]![0];
    expect(call.citySlugs).toEqual(['mumbai', 'pune']);
  });
});

describe('error propagation', () => {
  it('returns 500 when service throws', async () => {
    vi.mocked(searchService.search).mockRejectedValue(new Error('Meili down'));

    const res = await get('q=test');

    expect(res.status).toBe(500);
  });
});
