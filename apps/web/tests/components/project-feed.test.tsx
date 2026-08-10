import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCard } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  fetchHomeFeedPage: vi.fn(),
}));

vi.mock('@/lib/home-feed', () => ({
  fetchHomeFeedPage: mock.fetchHomeFeedPage,
}));

import { ProjectFeed } from '../../src/components/project-feed';
import { MAX_HOME_FEED_PAGE, type FeedFilterState } from '../../src/lib/feed-params';

const filters: FeedFilterState = {
  city: [],
  bhk: [],
  propertyType: [],
  scope: [],
  budgetBand: [],
  room: [],
  theme: [],
};

function card(id: string, title: string): DiscoveryCard {
  return {
    id,
    slug: id,
    title,
    coverImageUrl: null,
    coverImageWidth: 640,
    coverImageHeight: 800,
    designerName: 'Studio One',
    designerSlug: 'studio-one',
    city: 'Mumbai',
    bhk: '3 BHK',
    budget: '₹15L - ₹35L',
    ratingSnippet: null,
  };
}

describe('ProjectFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: class {
        constructor(_callback: IntersectionObserverCallback) {}
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() {
          return [];
        }
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    });
  });

  it('appends the next page without rewriting the current URL', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    mock.fetchHomeFeedPage.mockResolvedValue({
      items: [card('project-2', 'Second Project')],
      page: 2,
      hasMore: false,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    });

    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 1,
          hasMore: true,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
      />,
    );

    const firstPage = screen.getByText('First Project').closest('[data-feed-page]');
    const firstColumn = screen.getByText('First Project').closest('[data-feed-column]');
    expect(firstPage).toHaveAttribute('data-feed-page', '1');
    expect(firstColumn).toHaveAttribute('data-feed-column', '0');

    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));

    await waitFor(() => expect(mock.fetchHomeFeedPage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelectorAll('[data-feed-page]')).toHaveLength(2));
    expect(screen.getByText('Second Project')).toBeInTheDocument();
    expect(mock.fetchHomeFeedPage).toHaveBeenCalledWith({ filters, query: '', sort: 'recent' }, 2);
    expect(replaceState).not.toHaveBeenCalled();
    expect(firstPage).not.toContainElement(screen.getByText('Second Project'));
    expect(screen.getByText('Second Project').closest('[data-feed-page]')).toHaveAttribute(
      'data-feed-page',
      '2',
    );
    expect(screen.getByText('First Project').closest('[data-feed-column]')).toBe(firstColumn);
    expect(document.querySelectorAll('[data-masonry-feed]')).toHaveLength(1);
  });

  it('explains when search results were broadened', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'relaxed',
          relaxedFilters: ['budgetBandSlug', 'themes'],
        }}
        request={{ filters, query: 'warm home' }}
      />,
    );

    expect(
      screen.getByText('We broadened your results by relaxing budget, theme.'),
    ).toBeInTheDocument();
  });

  it('does not render an empty relaxation banner', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'relaxed',
          relaxedFilters: [],
        }}
        request={{ filters, query: 'warm home' }}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stops pagination cleanly at the API window limit', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: MAX_HOME_FEED_PAGE,
          hasMore: true,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '' }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Load more projects' })).not.toBeInTheDocument();
    expect(mock.fetchHomeFeedPage).not.toHaveBeenCalled();
  });
});
