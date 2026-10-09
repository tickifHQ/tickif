import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLandingCommunity } from '@/lib/landing-community';

const mocks = vi.hoisted(() => ({ projects: vi.fn(), designers: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { api: { search: { $get: mocks.projects } } } }));
vi.mock('@/lib/designer-discovery-api', () => ({ fetchDesignerSearch: mocks.designers }));

describe('landing community data', () => {
  beforeEach(() => vi.resetAllMocks());
  it('uses the total from search, not the preview page length', async () => {
    mocks.projects.mockResolvedValue(
      new Response(
        JSON.stringify({
          hits: [],
          estimatedTotalHits: 84,
          facetDistribution: {},
          processingTimeMs: 1,
          page: 1,
          limit: 1,
          fallback: 'none',
          relaxedFilters: [],
        }),
      ),
    );
    mocks.designers.mockResolvedValue({ hits: [], estimatedTotalHits: 12 });
    expect(await fetchLandingCommunity()).toMatchObject({
      projectCount: 84,
      designers: { estimatedTotalHits: 12 },
    });
  });
  it('preserves an available count when the other index is unavailable', async () => {
    mocks.projects.mockResolvedValue(new Response('{}', { status: 503 }));
    mocks.designers.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
    expect(await fetchLandingCommunity()).toEqual({
      projectCount: null,
      designers: { hits: [], estimatedTotalHits: 0 },
    });
  });
  it('does not invent counts for invalid responses or network failures', async () => {
    mocks.projects.mockResolvedValue(new Response('{}'));
    mocks.designers.mockRejectedValue(new Error('Offline'));
    expect(await fetchLandingCommunity()).toEqual({ projectCount: null, designers: null });
  });
});
