import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCard } from '@repo/contracts';

const mock = vi.hoisted(() => ({
  fetchHomeFeedPage: vi.fn(),
  observerOptions: [] as IntersectionObserverInit[],
}));

vi.mock('@/lib/home-feed', () => ({
  fetchHomeFeedPage: mock.fetchHomeFeedPage,
}));

import { ProjectFeed } from '../../src/components/project-feed';
import type { FeedFilterSuggestion } from '../../src/components/try-filter-card';
import { MAX_HOME_FEED_PAGE, type FeedFilterState } from '../../src/lib/feed-params';
import type { HomeFeedPage } from '../../src/lib/home-feed';

const filters: FeedFilterState = {
  city: [],
  bhk: [],
  propertyType: [],
  scope: [],
  budgetBand: [],
      room: [],
      theme: [],
      material: [],
      tag: [],
};

function card(id: string, title: string): DiscoveryCard {
  return {
    id,
    slug: id,
    title,
    studio: 'Studio One',
    city: 'Mumbai',
    locality: null,
    rating: 4.5,
    reviewCount: 10,
    budget: '₹15L - ₹35L',
    tags: ['3 BHK'],
    coverImageId: null,
    coverImageUrl: null,
    imageWidth: 640,
    imageHeight: 800,
  };
}

function filterSuggestion(index: number): FeedFilterSuggestion {
  return {
    href: `/home?theme=theme-${index}`,
    label: `Theme ${index}`,
    facet: 'theme',
    facetLabel: 'Theme',
  };
}

describe('ProjectFeed', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.observerOptions.length = 0;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: class {
        constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          mock.observerOptions.push(options ?? {});
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

  it('preloads another masonry page shortly before the feed boundary is visible', () => {
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
        request={{ filters, query: '' }}
      />,
    );

    expect(mock.observerOptions).toContainEqual({ rootMargin: '600px 0px' });
    expect(mock.fetchHomeFeedPage).not.toHaveBeenCalled();
  });

  it('keeps all 26 cards after equivalent server props arrive following page two', async () => {
    const initialPage: HomeFeedPage = {
      items: Array.from({ length: 24 }, (_, index) => card(`project-${index}`, `Project ${index}`)),
      page: 1,
      hasMore: true,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    };
    mock.fetchHomeFeedPage.mockResolvedValue({
      ...initialPage,
      items: [card('project-24', 'Project 24'), card('project-25', 'Project 25')],
      page: 2,
      hasMore: false,
    });
    const request = { filters, query: 'home' };
    const { rerender } = render(<ProjectFeed initialPage={initialPage} request={request} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(26));

    rerender(<ProjectFeed initialPage={structuredClone(initialPage)} request={{ ...request }} />);

    expect(screen.getAllByRole('article')).toHaveLength(26);
    expect(screen.queryByRole('button', { name: 'Load more projects' })).not.toBeInTheDocument();
  });

  it('keeps appended cards when presigned image URLs rotate during a server refresh', async () => {
    const initialCard = {
      ...card('project-1', 'First Project'),
      coverImageUrl:
        'https://storage.example.com/projects/first.webp?X-Amz-Date=20260905T000000Z&X-Amz-Signature=old',
    };
    const initialPage: HomeFeedPage = {
      items: [initialCard],
      page: 1,
      hasMore: true,
      facetDistribution: { citySlug: { mumbai: 1 }, themes: { modern: 1 } },
      fallback: 'none',
      relaxedFilters: [],
    };
    mock.fetchHomeFeedPage.mockResolvedValue({
      ...initialPage,
      items: [card('project-2', 'Second Project')],
      page: 2,
      hasMore: false,
    });
    const request = { filters, query: 'home' };
    const { rerender } = render(<ProjectFeed initialPage={initialPage} request={request} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));

    const refreshedImageUrl =
      'https://storage.example.com/projects/first.webp?X-Amz-Date=20260905T010000Z&X-Amz-Signature=new';
    rerender(
      <ProjectFeed
        initialPage={{
          ...initialPage,
          items: [{ ...initialCard, coverImageUrl: refreshedImageUrl }],
          // Search engines do not guarantee object-key order for facet counts.
          facetDistribution: { themes: { modern: 1 }, citySlug: { mumbai: 1 } },
        }}
        request={{ ...request }}
      />,
    );

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'First Project' })).toHaveAttribute(
      'src',
      refreshedImageUrl,
    );
  });

  it.each(['query', 'sort', 'page', 'refresh'] as const)(
    'resets appended pages when %s changes',
    async (change) => {
      const initialPage: HomeFeedPage = {
        items: [card('project-1', 'First Project')],
        page: 1,
        hasMore: true,
        facetDistribution: {},
        fallback: 'none',
        relaxedFilters: [],
      };
      const request = { filters, query: 'home', sort: 'recent' as const };
      mock.fetchHomeFeedPage.mockResolvedValue({
        ...initialPage,
        items: [card('project-2', 'Second Project')],
        page: 2,
        hasMore: false,
      });
      const { rerender } = render(<ProjectFeed initialPage={initialPage} request={request} />);
      fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
      await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));

      rerender(
        <ProjectFeed
          initialPage={{
            ...initialPage,
            ...(change === 'page' ? { page: 3 } : {}),
            ...(change === 'refresh' ? { items: [card('updated-1', 'Updated Project')] } : {}),
          }}
          request={{
            ...request,
            ...(change === 'query' ? { query: 'new home' } : {}),
            ...(change === 'sort' ? { sort: 'featured' as const } : {}),
          }}
        />,
      );

      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.queryByText('Second Project')).not.toBeInTheDocument();
      expect(
        screen.getByText(change === 'refresh' ? 'Updated Project' : 'First Project'),
      ).toBeInTheDocument();
    },
  );

  it('lets a new filtered feed paginate while ignoring the previous feed response', async () => {
    const initialPage: HomeFeedPage = {
      items: [card('old-1', 'Old first')],
      page: 1,
      hasMore: true,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    };
    let resolveOld!: (page: HomeFeedPage) => void;
    mock.fetchHomeFeedPage.mockReturnValueOnce(
      new Promise<HomeFeedPage>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const { rerender } = render(
      <ProjectFeed initialPage={initialPage} request={{ filters, query: 'home' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));

    const newRequest = { filters: { ...filters, city: ['pune'] }, query: 'home' };
    rerender(
      <ProjectFeed
        initialPage={{ ...initialPage, items: [card('new-1', 'New first')] }}
        request={newRequest}
      />,
    );
    mock.fetchHomeFeedPage.mockResolvedValueOnce({
      ...initialPage,
      items: [card('new-2', 'New second')],
      page: 2,
      hasMore: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
    await waitFor(() => expect(screen.getByText('New second')).toBeInTheDocument());
    expect(mock.fetchHomeFeedPage).toHaveBeenLastCalledWith(newRequest, 2);

    await act(async () =>
      resolveOld({ ...initialPage, items: [card('old-2', 'Old second')], page: 2 }),
    );
    expect(screen.queryByText('Old second')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(2);
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
    expect(firstPage).toHaveAttribute('data-feed-page', '1');

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
    expect(document.querySelectorAll('[data-masonry-feed]')).toHaveLength(1);
  });

  it('keeps existing cards in their masonry columns when another page is appended', async () => {
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (property: string) => (property === '--masonry-columns' ? '3' : ''),
    } as CSSStyleDeclaration);
    const firstPageItems = Array.from({ length: 12 }, (_, index) =>
      card(`project-${index}`, `Project ${index}`),
    );
    mock.fetchHomeFeedPage.mockResolvedValue({
      items: Array.from({ length: 6 }, (_, index) =>
        card(`project-${index + 12}`, `Project ${index + 12}`),
      ),
      page: 2,
      hasMore: false,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    });

    render(
      <ProjectFeed
        initialPage={{
          items: firstPageItems,
          page: 1,
          hasMore: true,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '' }}
      />,
    );

    expect(document.querySelector('[data-masonry-mode="stable"]')).toBeInTheDocument();
    const originalColumns = new Map(
      firstPageItems.map((project) => [
        project.id,
        screen
          .getByText(project.title)
          .closest('[data-feed-column]')
          ?.getAttribute('data-feed-column'),
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(18));

    for (const project of firstPageItems) {
      expect(
        screen
          .getByText(project.title)
          .closest('[data-feed-column]')
          ?.getAttribute('data-feed-column'),
      ).toBe(originalColumns.get(project.id));
    }
    expect(document.querySelectorAll('[data-masonry-feed]')).toHaveLength(1);
    getComputedStyle.mockRestore();
  });

  it('declares the masonry column count in CSS so server markup is correct at every breakpoint', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project'), card('project-2', 'Second Project')],
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
      />,
    );

    const masonry = document.querySelector('[data-masonry-feed]');
    expect(masonry).toHaveClass('columns-2');
    expect(masonry).toHaveClass('md:columns-3');
    expect(masonry).toHaveClass('2xl:columns-6');
    // Cards are direct children of the single multi-column container: no JS-measured
    // column wrappers that would scramble order before hydration.
    expect(document.querySelectorAll('[data-feed-column]')).toHaveLength(0);
    expect(Array.from(masonry?.children ?? []).map((child) => child.textContent)).toEqual([
      expect.stringContaining('First Project'),
      expect.stringContaining('Second Project'),
    ]);
  });

  it('places two filter cards in separated variable positions without moving them on refresh', () => {
    const initialPage: HomeFeedPage = {
      items: Array.from({ length: 24 }, (_, index) => card(`project-${index}`, `Project ${index}`)),
      page: 1,
      hasMore: true,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    };
    const filterSuggestions = Array.from({ length: 10 }, (_, index) => filterSuggestion(index));
    const request = { filters, query: '' };
    const { rerender } = render(
      <ProjectFeed
        initialPage={initialPage}
        request={request}
        infinite={false}
        filterSuggestions={filterSuggestions}
        filterCardPlacementSeed={123}
      />,
    );

    const masonry = document.querySelector('[data-masonry-feed]');
    const placementIndexes = () =>
      Array.from(masonry?.children ?? []).flatMap((child, index) =>
        child.hasAttribute('data-try-filter-card') ? [index] : [],
      );
    const initialPlacementIndexes = placementIndexes();

    expect(screen.getAllByRole('heading', { name: 'Try a filter' })).toHaveLength(2);
    expect(document.querySelectorAll('[data-try-filter-card]')).toHaveLength(2);
    expect(initialPlacementIndexes[1]! - initialPlacementIndexes[0]!).toBeGreaterThan(2);
    for (const suggestion of filterSuggestions) {
      expect(screen.getAllByRole('link', { name: suggestion.label })).toHaveLength(1);
    }

    // An equivalent RSC refresh can carry a new random seed, but an already
    // visible feed keeps the seed from its first render and does not jump.
    rerender(
      <ProjectFeed
        initialPage={structuredClone(initialPage)}
        request={{ ...request }}
        infinite={false}
        filterSuggestions={structuredClone(filterSuggestions)}
        filterCardPlacementSeed={987_654}
      />,
    );

    expect(placementIndexes()).toEqual(initialPlacementIndexes);
  });

  it('uses the placement seed to vary filter card positions between page loads', () => {
    const initialPage: HomeFeedPage = {
      items: Array.from({ length: 24 }, (_, index) => card(`project-${index}`, `Project ${index}`)),
      page: 1,
      hasMore: false,
      facetDistribution: {},
      fallback: 'none',
      relaxedFilters: [],
    };
    const props = {
      initialPage,
      request: { filters, query: '' },
      infinite: false,
      filterSuggestions: Array.from({ length: 10 }, (_, index) => filterSuggestion(index)),
    } as const;
    const positionsForSeed = (seed: number) => {
      const { unmount } = render(<ProjectFeed {...props} filterCardPlacementSeed={seed} />);
      const masonry = document.querySelector('[data-masonry-feed]');
      const indexes = Array.from(masonry?.children ?? []).flatMap((child, index) =>
        child.hasAttribute('data-try-filter-card') ? [index] : [],
      );
      unmount();
      return indexes;
    };

    const placements = new Set(
      [1, 2, 3, 4, 5].map((seed) => JSON.stringify(positionsForSeed(seed))),
    );
    expect(placements.size).toBeGreaterThan(1);
  });

  it('keeps multiple filter cards in separate masonry columns', () => {
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (property: string) => (property === '--masonry-columns' ? '3' : ''),
    } as CSSStyleDeclaration);

    render(
      <ProjectFeed
        initialPage={{
          items: Array.from({ length: 24 }, (_, index) =>
            card(`project-${index}`, `Project ${index}`),
          ),
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '' }}
        filterSuggestions={Array.from({ length: 10 }, (_, index) => filterSuggestion(index))}
        filterCardPlacementSeed={123}
      />,
    );

    const filterColumns = [...document.querySelectorAll('[data-try-filter-card]')].map((card) =>
      card.closest('[data-feed-column]')?.getAttribute('data-feed-column'),
    );
    expect(filterColumns).toHaveLength(2);
    expect(new Set(filterColumns).size).toBe(2);
    getComputedStyle.mockRestore();
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

  it('renders a visible previous/next control for a deep-linked page', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 3,
          hasMore: true,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
        infinite={false}
        paginationParams={{ city: 'mumbai' }}
      />,
    );

    const pagination = screen.getByRole('navigation', { name: 'Feed pages' });
    expect(within(pagination).getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/?city=mumbai&page=2',
    );
    expect(within(pagination).getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/?city=mumbai&page=4',
    );
    expect(within(pagination).getByText('Page 3')).toBeInTheDocument();
  });

  it('keeps visible pagination on the configured feed base', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 3,
          hasMore: true,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
        infinite={false}
        paginationParams={{ city: 'mumbai' }}
        paginationBase="/home"
      />,
    );

    const pagination = screen.getByRole('navigation', { name: 'Feed pages' });
    expect(within(pagination).getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/home?city=mumbai&page=2',
    );
    expect(within(pagination).getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/home?city=mumbai&page=4',
    );
  });

  it('keeps the empty-state reset on the configured feed base', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [],
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
        infinite={false}
        paginationParams={{}}
        paginationBase="/home"
      />,
    );

    expect(screen.getByRole('link', { name: 'Clear search and filters' })).toHaveAttribute(
      'href',
      '/home',
    );
  });

  it('omits the pagination control on page one of an exhausted feed', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [card('project-1', 'First Project')],
          page: 1,
          hasMore: false,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
        paginationParams={{}}
      />,
    );

    expect(screen.queryByRole('navigation', { name: 'Feed pages' })).not.toBeInTheDocument();
  });

  it('advances the next-page link past the pages already appended', async () => {
    mock.fetchHomeFeedPage.mockResolvedValue({
      items: [card('project-2', 'Second Project')],
      page: 2,
      hasMore: true,
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
        paginationParams={{}}
      />,
    );

    expect(screen.queryByRole('navigation', { name: 'Feed pages' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more projects' }));

    await waitFor(() => expect(screen.getByText('Second Project')).toBeInTheDocument());
    expect(screen.queryByRole('navigation', { name: 'Feed pages' })).not.toBeInTheDocument();
  });

  it('keeps a way back when a deep page has no results', () => {
    render(
      <ProjectFeed
        initialPage={{
          items: [],
          page: 4,
          hasMore: false,
          facetDistribution: {},
          fallback: 'none',
          relaxedFilters: [],
        }}
        request={{ filters, query: '', sort: 'recent' }}
        infinite={false}
        paginationParams={{}}
      />,
    );

    expect(screen.getByText('No projects found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/?page=3');
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
