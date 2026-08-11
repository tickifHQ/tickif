import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

// Mock next/navigation for client components that use useRouter
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

vi.stubGlobal('fetch', vi.fn());

import HomePage from '../../../app/(public)/page';

const feedProject = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'test-project',
  title: 'Test Project',
  studio: 'Studio A',
  city: 'Mumbai',
  locality: 'Bandra',
  rating: 4.5,
  reviewCount: 10,
  budget: '₹15L - ₹35L',
  tags: ['3 BHK'],
  coverImageId: '33333333-3333-4333-8333-333333333333',
  coverImageUrl: 'https://example.com/image.jpg',
  imageWidth: 480,
  imageHeight: 600,
};

function mockFetchResponses(projects: Array<typeof feedProject>) {
  (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    // Feed endpoint
    if (url.includes('/api/projects/feed')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ projects, page: 1, limit: 24, hasMore: false }),
      };
    }
    // Taxonomy endpoints
    if (url.includes('/api/taxonomy/terms')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ terms: [] }),
      };
    }
    // Default
    return { ok: true, status: 200, json: async () => ({}) };
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
    mockFetchResponses([]);
  });

  it('renders the logged-out state: trust strip, hero, and trending projects feed', async () => {
    mockFetchResponses([feedProject]);

    render(await HomePage());

    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('renders the empty state when the feed has no projects', async () => {
    render(await HomePage());

    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('No projects match this filter.')).toBeInTheDocument();
  });

  it('renders the empty state gracefully when the feed API fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(await HomePage());

    expect(screen.getByText('No projects match this filter.')).toBeInTheDocument();
  });

  it('renders the logged-in state: search bar straight into the feed, no hero or trust strip', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-12-31T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    mockFetchResponses([feedProject]);

    render(await HomePage());

    expect(screen.getByRole('search')).toBeInTheDocument();
    // Logged-out chrome must not render
    expect(screen.queryByText('No commissions · No middlemen')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trending projects' })).not.toBeInTheDocument();
    // Shared feed renders the API projects
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });
});
