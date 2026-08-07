import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCard } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  fetchHomeFeedPage: vi.fn(),
}));

vi.mock('@/lib/home-feed', () => ({
  fetchHomeFeedPage: mock.fetchHomeFeedPage,
}));

import { ProjectFeed } from '../../src/components/project-feed';
import type { FeedFilterState } from '../../src/lib/feed-params';

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
  let intersectionCallback: IntersectionObserverCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }
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

  it('appends the next page on intersection and replaces the page URL', async () => {
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

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    await waitFor(() => expect(screen.getByText('Second Project')).toBeInTheDocument());
    expect(mock.fetchHomeFeedPage).toHaveBeenCalledWith({ filters, query: '', sort: 'recent' }, 2);
    expect(replaceState).toHaveBeenCalled();
    expect(String(replaceState.mock.calls.at(-1)?.[2])).toContain('page=2');
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
});
