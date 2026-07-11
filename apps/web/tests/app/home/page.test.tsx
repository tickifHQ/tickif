import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock fetch for server-side data fetching
vi.stubGlobal('fetch', vi.fn());

import HomePage from '../../../app/(public)/page';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], page: 1, limit: 30, hasMore: false }),
    });
  });

  it('renders the trending projects section with empty state when no projects', async () => {
    render(await HomePage());

    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('No projects yet — check back soon.')).toBeInTheDocument();
    expect(screen.getByText('See all projects →')).toBeInTheDocument();
  });

  it('renders project cards when feed returns projects', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [
          {
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
            coverImageUrl: null,
            imageWidth: 480,
            imageHeight: 600,
          },
        ],
        page: 1,
        limit: 30,
        hasMore: false,
      }),
    });

    render(await HomePage());

    expect(screen.getByRole('heading', { name: 'Trending projects' })).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.queryByText('No projects yet — check back soon.')).not.toBeInTheDocument();
  });

  it('shows empty state gracefully when API fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    render(await HomePage());

    expect(screen.getByText('No projects yet — check back soon.')).toBeInTheDocument();
  });
});
