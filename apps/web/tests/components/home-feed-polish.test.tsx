import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock @/env
vi.mock('@/env', () => ({
  env: { NEXT_PUBLIC_API_URL: 'http://localhost:8008' },
}));

// Mock @/lib/api
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      projects: {
        feed: {
          $get: vi.fn(),
        },
      },
    },
  },
}));

vi.stubGlobal('fetch', vi.fn());

import { DiscoveryFeedSection } from '../../src/components/discovery-feed-section';
import { ShowcaseCard } from '../../src/components/showcase-card';

const feedProject = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'test-project',
  title: 'Test Project',
  studio: 'Studio A',
  city: 'Mumbai',
  locality: 'Bandra',
  rating: 4.5,
  reviewCount: 10,
  budget: '₹15L - ₹35L',
  tags: ['3 BHK'],
  coverImageId: '22222222-2222-4222-8222-222222222222',
  coverImageUrl: 'https://example.com/image.jpg',
  imageWidth: 480,
  imageHeight: 600,
};

const feedProjectNoCover = {
  ...feedProject,
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'no-cover-project',
  title: 'No Cover Project',
  coverImageId: null,
  coverImageUrl: null,
};

describe('DiscoveryFeedSection — error states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error state when filter API fails with network error', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(
      <DiscoveryFeedSection
        initialProjects={[feedProject]}
        initialHasMore={false}
        filterChips={[{ slug: 'mumbai', label: 'Mumbai', kind: 'citySlug' }]}
        budgetChips={[]}
      />,
    );

    // Click a filter chip to trigger the API call
    fireEvent.click(screen.getByRole('button', { name: 'Mumbai' }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong loading projects. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error state when filter API returns non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    render(
      <DiscoveryFeedSection
        initialProjects={[feedProject]}
        initialHasMore={false}
        filterChips={[{ slug: 'mumbai', label: 'Mumbai', kind: 'citySlug' }]}
        budgetChips={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mumbai' }));

    await waitFor(() => {
      expect(screen.getByText('Something went wrong loading projects. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows retry button on error that re-attempts the request', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Fail'));

    render(
      <DiscoveryFeedSection
        initialProjects={[feedProject]}
        initialHasMore={false}
        filterChips={[{ slug: 'mumbai', label: 'Mumbai', kind: 'citySlug' }]}
        budgetChips={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mumbai' }));

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    // Retry should call fetch again
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [], page: 1, limit: 24, hasMore: false, source: 'db' }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('DiscoveryFeedSection — deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not duplicate existing projects when loading more returns overlapping items', async () => {
    const { api } = await import('../../src/lib/api');
    const mockGet = vi.mocked(api.api.projects.feed.$get);
    mockGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        projects: [feedProject], // Same project as initial
        page: 2,
        limit: 24,
        hasMore: false,
      }),
    } as never);

    render(
      <DiscoveryFeedSection
        initialProjects={[feedProject]}
        initialHasMore={true}
        filterChips={[]}
        budgetChips={[]}
      />,
    );

    // Should show 1 project initially
    expect(screen.getAllByText('Test Project')).toHaveLength(1);

    // Click Load more
    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));

    await waitFor(() => {
      // Should still show only 1 (deduplicated)
      expect(screen.getAllByText('Test Project')).toHaveLength(1);
    });
  });
});

describe('ShowcaseCard — missing image handling', () => {
  it('renders card with placeholder when coverImageUrl is null', () => {
    render(<ShowcaseCard project={feedProjectNoCover} />);

    // Card should still render with title
    expect(screen.getByText('No Cover Project')).toBeInTheDocument();
    // Should be a navigable link
    expect(screen.getByRole('link')).toHaveAttribute('href');
  });

  it('renders card with image when coverImageUrl is present', () => {
    render(<ShowcaseCard project={feedProject} />);

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByAltText('Test Project')).toBeInTheDocument();
  });
});

describe('SearchCombobox — autocomplete loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets aria-busy while suggest request is pending', async () => {
    // Make fetch return a delayed response
    let resolveFetch: (value: unknown) => void;
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { SearchCombobox } = await import('../../src/components/search-combobox');
    render(<SearchCombobox />);

    const input = screen.getByRole('searchbox');

    // Verify aria-busy starts false
    expect(input).toHaveAttribute('aria-busy', 'false');

    // Type enough to trigger suggest (min 2 chars + 250ms debounce)
    fireEvent.change(input, { target: { value: 'modern living' } });

    // Resolve fetch after a small delay to let debounce fire
    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalled();
      },
      { timeout: 1000 },
    );

    // Now resolve the fetch
    resolveFetch!({
      ok: true,
      json: async () => ({ projects: [], designers: [], processingTimeMs: 5 }),
    });
  });
});
