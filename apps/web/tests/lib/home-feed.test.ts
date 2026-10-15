import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  searchGet: vi.fn(),
  followingGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      search: { $get: mock.searchGet },
      following: { feed: { $get: mock.followingGet } },
    },
  },
}));

import { fetchHomeFeedPage } from '../../src/lib/home-feed';

const filters = {
  city: [],
  locality: [],
  propertySubtype: [],
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
  it('retains current studio verification from the search response', async () => {
    const body = searchResponse({ citySlug: null });
    mock.searchGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...body,
          hits: body.hits.map((hit) => ({ ...hit, studioIsVerified: true })),
        }),
      ),
    );
    expect(
      (await fetchHomeFeedPage({ filters, query: 'calm' }, 1)).items[0]?.studioIsVerified,
    ).toBe(true);
  });
  it('keeps search and pagination inside the private following feed and forwards only server cookies', async () => {
    mock.followingGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: 2,
          limit: 24,
          hasMore: false,
          source: 'db',
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }),
      ),
    );
    const result = await fetchHomeFeedPage({ filters, query: 'calm', scope: 'following' }, 2, {
      cookie: 'test-session',
    });
    expect(result.items).toEqual([]);
    expect(mock.followingGet).toHaveBeenCalledWith(
      { query: { sort: 'recent', page: 2, limit: 24, q: 'calm' } },
      { init: { cache: 'no-store', headers: { cookie: 'test-session' } } },
    );
    expect(mock.searchGet).not.toHaveBeenCalled();
  });
  it('does not fall back to public projects if the following feed fails', async () => {
    mock.followingGet.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(fetchHomeFeedPage({ filters, query: '', scope: 'following' }, 1)).rejects.toThrow(
      'Following request failed',
    );
  });
  beforeEach(() => mock.searchGet.mockReset());

  it('propagates a failed budget-backed search for the feed retry state', async () => {
    mock.searchGet.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(fetchHomeFeedPage({ filters, query: 'calm' }, 1)).rejects.toThrow(
      'Search request failed with status 503.',
    );
  });

  it('rejects a malformed saved budget instead of rendering an invented price', async () => {
    const body = searchResponse({ citySlug: null });
    mock.searchGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...body,
          hits: body.hits.map((hit) => ({ ...hit, budgetBandLabel: 1500000 })),
        }),
      ),
    );
    await expect(fetchHomeFeedPage({ filters, query: 'calm' }, 1)).rejects.toThrow(
      'Search returned an invalid response.',
    );
  });

  it.each(['₹15L - ₹35L', null])(
    'uses the API saved budget label (%s) rather than humanizing a retired slug',
    async (budgetBandLabel) => {
      const body = searchResponse({ citySlug: null });
      mock.searchGet.mockResolvedValue(
        new Response(
          JSON.stringify({
            ...body,
            hits: body.hits.map((hit) => ({ ...hit, budgetBandSlug: 'upscale', budgetBandLabel })),
          }),
        ),
      );
      const result = await fetchHomeFeedPage({ filters, query: 'calm' }, 1);
      expect(result.items[0]?.budget).toBe(budgetBandLabel);
    },
  );

  it.each([
    { slug: '10l-20l', expected: '₹10L - ₹20L' },
    { slug: 'upscale', expected: null },
  ])(
    'supports older responses without inventing a budget for $slug',
    async ({ slug, expected }) => {
      const body = searchResponse({ citySlug: null });
      mock.searchGet.mockResolvedValue(
        new Response(
          JSON.stringify({
            ...body,
            hits: body.hits.map((hit) => ({ ...hit, budgetBandSlug: slug })),
          }),
        ),
      );
      const result = await fetchHomeFeedPage(
        { filters, query: 'calm', budgetLabelsBySlug: { '10l-20l': '₹10L - ₹20L' } },
        1,
      );
      expect(result.items[0]?.budget).toBe(expected);
    },
  );

  it('preserves the studio logo in search-backed cards', async () => {
    const body = searchResponse({ citySlug: 'mumbai' });
    mock.searchGet.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...body,
          hits: body.hits.map((hit) => ({
            ...hit,
            studioLogoUrl: 'https://media.example/studio.png',
          })),
        }),
      ),
    );
    const result = await fetchHomeFeedPage({ filters, query: 'calm' }, 1);
    expect(result.items[0]?.studioLogoUrl).toBe('https://media.example/studio.png');
  });

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
