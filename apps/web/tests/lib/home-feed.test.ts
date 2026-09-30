import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  searchGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      search: { $get: mock.searchGet },
    },
  },
}));

import { fetchHomeFeedPage } from '../../src/lib/home-feed';

const filters = {
  city: [],
  bhk: [],
  budgetBand: [],
  room: [],
  propertyType: [],
  scope: [],
  theme: [],
  material: [],
  tag: [],
};

function searchResponse(city: { citySlug: string | null; cityName?: string | null }) {
  return {
    hits: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'calm-residence',
        title: 'Calm Residence',
        description: null,
        designerId: '22222222-2222-4222-8222-222222222222',
        designerSlug: 'studio-one',
        designerName: 'Studio One',
        ...city,
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
        coverImageUrl: null,
        publishedAt: 1,
      },
    ],
    estimatedTotalHits: 1,
    facetDistribution: {},
    processingTimeMs: 1,
    page: 1,
    limit: 24,
    fallback: 'none',
    relaxedFilters: [],
  };
}

describe('fetchHomeFeedPage', () => {
  beforeEach(() => mock.searchGet.mockReset());

  it('maps a custom city name onto search-backed project cards', async () => {
    mock.searchGet.mockResolvedValue(
      new Response(JSON.stringify(searchResponse({ citySlug: null, cityName: 'Pondicherry' })), {
        status: 200,
      }),
    );

    const result = await fetchHomeFeedPage({ filters, query: 'calm' }, 1);

    expect(result.items[0]).toMatchObject({ city: 'Pondicherry', locality: null });
  });

  it('keeps the taxonomy label when a standard city is present', async () => {
    mock.searchGet.mockResolvedValue(
      new Response(JSON.stringify(searchResponse({ citySlug: 'mumbai', cityName: null })), {
        status: 200,
      }),
    );

    const result = await fetchHomeFeedPage(
      { filters, query: 'calm', cityLabelsBySlug: { mumbai: 'Mumbai' } },
      1,
    );

    expect(result.items[0]).toMatchObject({ city: 'Mumbai' });
  });
});
