import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
}));

vi.stubGlobal('fetch', vi.fn());

import HomePage from '../../../app/(public)/page';

const feedProject = {
  id: 'p1',
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
  coverImageUrl: null,
  imageWidth: 480,
  imageHeight: 600,
};

function mockFeed(projects: Array<typeof feedProject>) {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ projects, page: 1, limit: 30, hasMore: false }),
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
    mockFeed([]);
  });

  it('renders the logged-out state: trust strip, hero, and trending projects feed', async () => {
    mockFeed([feedProject]);

    render(await HomePage());

    expect(screen.getByText('No commissions · No middlemen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('See all projects →')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    // Logged-in-only search scope buttons must not render
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Designers' })).not.toBeInTheDocument();
  });

  it('renders the empty state when the feed has no projects', async () => {
    render(await HomePage());

    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('No projects yet — check back soon.')).toBeInTheDocument();
  });

  it('renders the empty state gracefully when the feed API fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(await HomePage());

    expect(screen.getByText('No projects yet — check back soon.')).toBeInTheDocument();
  });

  it('renders the logged-in state: search bar straight into the feed, no hero or trust strip', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-12-31T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    mockFeed([feedProject]);

    render(await HomePage());

    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Designers' })).toBeInTheDocument();
    // Logged-out chrome must not render
    expect(screen.queryByText('No commissions · No middlemen')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trending projects' })).not.toBeInTheDocument();
    // Shared feed renders the API projects
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Filters' }).length).toBeGreaterThan(0);
  });
});
