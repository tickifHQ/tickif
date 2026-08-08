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
  coverImageUrl: 'https://images.example.com/cover.jpg',
  coverImageWidth: 640,
  coverImageHeight: 800,
  designerName: 'Studio A',
  designerSlug: 'studio-a',
  city: 'Mumbai',
  bhk: '3 BHK',
  budget: '₹15L - ₹35L',
  ratingSnippet: '4.5 (10 reviews)',
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
          designerSlug: item.designerSlug,
          designerName: item.designerName,
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
      const page = Number(new URL(url).searchParams.get('page') ?? '1');
      return response({
        items,
        page,
        limit: 24,
        hasMore,
        source: 'db',
        facetDistribution: {},
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

  it('renders one featured discovery section with filters above the grid for logged-out visitors', async () => {
    render(await HomePage());

    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Featured projects' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recently published' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Test Project')).toHaveLength(1);
    expect(
      screen
        .getByRole('button', { name: 'Filters' })
        .compareDocumentPosition(screen.getByText('Test Project')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('link', { name: 'Homes in Mumbai' })).toHaveAttribute(
      'href',
      '/?city=mumbai',
    );
    expect(screen.getByRole('link', { name: 'Living Room ideas' })).toHaveAttribute(
      'href',
      '/?room=living-room',
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

    expect(screen.getByText('No projects found')).toBeInTheDocument();
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
    expect(within(screen.getByRole('article')).getByText('₹15-35L')).toBeInTheDocument();
  });

  it('generates a canonical URL for the crawlable page', async () => {
    const metadata = await generateMetadata({
      searchParams: Promise.resolve({ q: 'warm kitchen', page: '3', ignored: 'value' }),
    });

    expect(metadata.alternates?.canonical).toBe('/?q=warm+kitchen&page=3');
  });
});
