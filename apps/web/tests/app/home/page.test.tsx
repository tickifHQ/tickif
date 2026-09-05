import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

vi.stubGlobal('fetch', vi.fn());

import HomePage, { generateMetadata } from '../../../app/(public)/page';

const discoveryCard = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'test-project',
  title: 'Test Project',
  studio: 'Studio A',
  city: 'Mumbai',
  locality: null,
  rating: 4.5,
  reviewCount: 10,
  budget: '₹15L - ₹35L',
  tags: ['3 BHK'],
  coverImageId: null,
  coverImageUrl: 'https://images.example.com/cover.jpg',
  imageWidth: 640,
  imageHeight: 800,
};

function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

function mockApi({ items = [discoveryCard], hasMore = false } = {}) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/taxonomy/terms')) {
      const kind = new URL(url).searchParams.get('kind');
      if (kind === 'city') {
        return response({
          terms: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              label: 'Mumbai',
              slug: 'mumbai',
              parentId: null,
            },
          ],
        });
      }
      if (kind === 'room') {
        return response({
          terms: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              label: 'Living Room',
              slug: 'living-room',
              parentId: null,
            },
          ],
        });
      }
      if (kind === 'bhk') {
        return response({
          terms: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              label: '3 BHK',
              slug: '3-bhk',
              parentId: null,
            },
          ],
        });
      }
      if (kind === 'budget_band') {
        return response({
          terms: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              label: '₹15L - ₹35L',
              slug: 'upscale',
              parentId: null,
            },
          ],
        });
      }
      return response({ terms: [] });
    }
    if (url.includes('/api/search?')) {
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return response({
        hits: items.map((item) => ({
          id: item.id,
          slug: item.slug,
          title: item.title,
          description: null,
          designerId: '22222222-2222-4222-8222-222222222222',
          designerSlug: 'studio-a',
          designerName: item.studio,
          citySlug: 'mumbai',
          localitySlug: null,
          propertyTypeSlug: null,
          propertySubtypeSlug: null,
          scopeSlug: null,
          bhkSlug: '3-bhk',
          budgetBandSlug: 'upscale',
          sizeSqft: null,
          themes: [],
          materials: [],
          finishes: [],
          roomSlugs: [],
          coverImageUrl: item.coverImageUrl,
          publishedAt: 1_700_000_000_000,
        })),
        estimatedTotalHits: items.length,
        facetDistribution: {},
        processingTimeMs: 2,
        page,
        limit: 24,
        fallback: 'none',
        relaxedFilters: [],
      });
    }
    if (url.includes('/api/discovery/feed')) {
      const requestUrl = new URL(url);
      const page = Number(requestUrl.searchParams.get('page') ?? '1');
      return response({
        items,
        page,
        limit: Number(requestUrl.searchParams.get('limit') ?? '24'),
        hasMore,
        source: 'db',
        facetDistribution: {},
        fallback: 'none',
        relaxedFilters: [],
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
    mockApi();
  });

  it('renders the featured strip and the reachable recent feed for logged-out visitors', async () => {
    render(await HomePage());

    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Featured projects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recently published' })).toBeInTheDocument();
    // Featured strip plus the recent feed — the recent items now render somewhere.
    expect(screen.getAllByText('Test Project')).toHaveLength(2);
    expect(
      screen
        .getByRole('button', { name: 'Filters' })
        .compareDocumentPosition(screen.getAllByText('Test Project')[0]!),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('link', { name: 'Homes in Mumbai' })).toHaveAttribute(
      'href',
      '/?city=mumbai',
    );
    expect(screen.getByRole('link', { name: 'Living Room ideas' })).toHaveAttribute(
      'href',
      '/?room=living-room',
    );

    const discoveryCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/discovery/feed'));
    expect(discoveryCalls).toEqual(
      expect.arrayContaining([expect.stringContaining('sort=featured')]),
    );
    // No probe request: both feeds are fetched at the real page size.
    expect(discoveryCalls.every((url) => url.includes('limit=24'))).toBe(true);
  });

  it('points "See all projects" at the recent feed instead of the current URL', async () => {
    render(await HomePage());

    const seeAll = screen.getByRole('link', { name: 'See all projects' });
    expect(seeAll).toHaveAttribute('href', '#recent-projects-feed');
    expect(document.getElementById('recent-projects-feed')).not.toBeNull();
    expect(
      document
        .getElementById('recent-projects-feed')
        ?.contains(screen.getAllByText('Test Project')[1] ?? null),
    ).toBe(true);
  });

  it('advertises rel=next only when a full page of results is available', async () => {
    mockApi({ hasMore: false });

    render(await HomePage());

    expect(document.querySelector('link[rel="next"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('renders a visible next-page control on the logged-out default feed', async () => {
    mockApi({ hasMore: true });

    render(await HomePage());

    expect(document.querySelector('link[rel="next"]')).toHaveAttribute('href', '/?page=2');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/?page=2');
  });

  it('renders the taxonomy-driven try-filter card in the logged-out featured feed', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      ...discoveryCard,
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
      slug: `test-project-${index + 1}`,
      title: `Test Project ${index + 1}`,
    }));
    mockApi({ items });

    render(await HomePage());

    expect(screen.getByRole('heading', { name: 'Try a filter' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '₹15–35L' })).toHaveAttribute(
      'href',
      '/?budgetBand=upscale',
    );
  });

  it('renders a useful zero-result state', async () => {
    mockApi({ items: [] });

    render(await HomePage({ searchParams: Promise.resolve({ q: 'impossible room' }) }));

    expect(
      screen.getByRole('heading', { name: 'Results for “impossible room”' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No matching projects')).toBeInTheDocument();
  });

  it('renders the empty state gracefully when the discovery API fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/taxonomy/terms')) return response({ terms: [] });
      throw new Error('Network error');
    });

    render(await HomePage());

    // Featured strip and recent feed both degrade to the empty state.
    expect(screen.getAllByText('No projects found')).toHaveLength(2);
  });

  it('renders the logged-in search, filters, and real feed without logged-out chrome', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-12-31T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });

    render(await HomePage());

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.queryByText('No commissions · No middlemen')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Featured projects' })).not.toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getAllByText('Filters').length).toBeGreaterThan(0);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
        String(input).includes('sort=featured'),
      ),
    ).toBe(false);
  });

  it('SSR-renders a deep-linked discovery page with filters', async () => {
    mockApi({ hasMore: true });

    render(
      await HomePage({
        searchParams: Promise.resolve({ city: 'mumbai,pune', page: '2' }),
      }),
    );

    const feedCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) => {
      const url = String(input);
      return url.includes('/api/discovery/feed') && url.includes('page=2');
    });
    const feedUrl = String(feedCall?.[0]);

    expect(feedUrl).toContain('citySlug=mumbai');
    expect(feedUrl).toContain('citySlug=pune');
    expect(document.querySelector('link[rel="prev"]')).toHaveAttribute(
      'href',
      '/?city=mumbai%2Cpune',
    );
    expect(document.querySelector('link[rel="next"]')).toHaveAttribute(
      'href',
      '/?city=mumbai%2Cpune&page=3',
    );

    // …and the same hrefs are reachable as real controls, not just <link> hints.
    const pagination = screen.getByRole('navigation', { name: 'Feed pages' });
    expect(within(pagination).getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/?city=mumbai%2Cpune',
    );
    expect(within(pagination).getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/?city=mumbai%2Cpune&page=3',
    );
  });

  it('revalidates taxonomy requests instead of refetching them on every render', async () => {
    render(await HomePage());

    const taxonomyCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) =>
      String(input).includes('/api/taxonomy/terms?kind=city'),
    );

    expect(taxonomyCall?.[1]).toEqual(
      expect.objectContaining({ next: { revalidate: 60 * 60 * 24 * 7 } }),
    );
  });

  it('SSR-renders an unfiltered deep-linked page instead of the page-one featured view', async () => {
    mockApi({ hasMore: true });

    render(await HomePage({ searchParams: Promise.resolve({ page: '2' }) }));

    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Featured projects' })).not.toBeInTheDocument();

    const feedCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) => {
      const url = String(input);
      return url.includes('/api/discovery/feed') && url.includes('page=2');
    });
    expect(feedCall).toBeDefined();
  });

  it('renders q through the project search endpoint on the same page', async () => {
    render(await HomePage({ searchParams: Promise.resolve({ q: 'warm kitchen' }) }));

    const searchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) =>
      String(input).includes('/api/search?q=warm+kitchen'),
    );

    expect(searchCall).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Results for “warm kitchen”' })).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('₹15–35L')).toBeInTheDocument();
    expect(within(screen.getByRole('article')).getByText('3 BHK')).toBeInTheDocument();
  });

  it('starts the search request before taxonomy responses finish', async () => {
    const taxonomyResolvers: Array<(value: ReturnType<typeof response>) => void> = [];
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/taxonomy/terms')) {
        return new Promise((resolve) => taxonomyResolvers.push(resolve));
      }
      if (url.includes('/api/search?')) {
        return Promise.resolve(
          response({
            hits: [],
            estimatedTotalHits: 0,
            facetDistribution: {},
            processingTimeMs: 2,
            page: 1,
            limit: 24,
            fallback: 'none',
            relaxedFilters: [],
          }),
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const pagePromise = HomePage({ searchParams: Promise.resolve({ q: 'warm kitchen' }) });
    try {
      await vi.waitFor(() => {
        expect(
          (fetch as ReturnType<typeof vi.fn>).mock.calls.some(([input]) =>
            String(input).includes('/api/search?'),
          ),
        ).toBe(true);
      });
    } finally {
      for (const resolveTaxonomy of taxonomyResolvers) {
        resolveTaxonomy(response({ terms: [] }));
      }
    }
    await pagePromise;
  });

  it('preserves the current search and filters in budget suggestion links', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      ...discoveryCard,
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
      slug: `test-project-${index + 1}`,
      title: `Test Project ${index + 1}`,
    }));
    mockApi({ items });

    render(
      await HomePage({
        searchParams: Promise.resolve({
          q: 'warm kitchen',
          city: 'mumbai',
          bhk: '3-bhk',
          page: '4',
        }),
      }),
    );

    expect(screen.getByRole('link', { name: '₹15–35L' })).toHaveAttribute(
      'href',
      '/?q=warm+kitchen&city=mumbai&bhk=3-bhk&budgetBand=upscale',
    );
  });

  it('omits the active budget band from the suggestion chips', async () => {
    const items = Array.from({ length: 14 }, (_, index) => ({
      ...discoveryCard,
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
      slug: `test-project-${index + 1}`,
      title: `Test Project ${index + 1}`,
    }));
    mockApi({ items });

    render(await HomePage({ searchParams: Promise.resolve({ budgetBand: 'upscale' }) }));

    expect(screen.queryByRole('heading', { name: 'Try a filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '₹15–35L' })).not.toBeInTheDocument();
  });

  it('generates a canonical URL for the crawlable page', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ q: 'warm kitchen', page: '3', ignored: 'value' }),
    });

    expect(metadata.alternates?.canonical).toBe('/?q=warm+kitchen&page=3');
  });
});
