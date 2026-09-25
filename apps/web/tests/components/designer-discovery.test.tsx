import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DesignerHit, SearchDesignersResponse } from '@repo/contracts';
import { DesignerDiscoveryResults } from '../../src/components/designer-discovery-results';
import { DesignerDiscoveryFilters } from '../../src/components/designer-discovery-filters';
import DesignersError from '../../app/(public)/designers/error';
import { parseDesignerParams } from '../../src/lib/designer-discovery-params';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  fetchDesignerSearch: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks }));
vi.mock('../../src/lib/designer-discovery-api', () => ({
  fetchDesignerSearch: mocks.fetchDesignerSearch,
}));
const designer: DesignerHit = {
  id: 'designer-1',
  slug: 'oak-studio',
  displayName: 'Oak Studio',
  bio: 'Thoughtful homes',
  tagline: 'Calm spaces for everyday living',
  entityType: 'company',
  citySlugs: ['mumbai'],
  localitySlugs: [],
  scopeSlugs: ['full-home'],
  themeSlugs: [],
  yearsExperience: 8,
  projectCount: 12,
  avgRating: 4.75,
  reviewCount: 8,
  googleRating: 4.9,
  googleRatingCount: 127,
  isKycVerified: true,
  logoUrl: null,
  heroUrl: 'https://cdn.example.com/oak-studio-hero.webp',
};
const result: SearchDesignersResponse = {
  hits: [designer],
  estimatedTotalHits: 26,
  page: 1,
  limit: 24,
  facetDistribution: {},
  processingTimeMs: 1,
};
const options = {
  citySlugs: [{ value: 'mumbai', label: 'Mumbai' }],
  localitySlugs: [],
  scopeSlugs: [{ value: 'full-home', label: 'Full home' }],
  themeSlugs: [{ value: 'modern', label: 'Modern' }],
};
beforeEach(() => vi.clearAllMocks());

describe('designer discovery', () => {
  it('clears unsaved filters even when the URL is already the default directory', () => {
    render(<DesignerDiscoveryFilters query={parseDesignerParams({})} options={options} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'All designers' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
  it('uses the compact Explore search and filter controls', () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({ citySlugs: 'mumbai', entityType: 'company' })}
        options={options}
      />,
    );

    expect(screen.getByRole('button', { name: 'Designer filters (2 selected)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sort designers' })).toHaveTextContent(
      'Most relevant',
    );
    expect(screen.getByRole('button', { name: 'Remove Mumbai filter' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remove Studios filter' })).toBeVisible();
  });
  it('keeps the filter menu open while selecting facets and applies them together', async () => {
    render(<DesignerDiscoveryFilters query={parseDesignerParams({})} options={options} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Designer filters' }), { button: 0 });
    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'City' }), {
      pointerType: 'mouse',
    });
    const cityOption = await screen.findByRole('menuitemcheckbox', { name: 'Mumbai' });
    fireEvent.click(cityOption);
    expect(cityOption).toHaveAttribute('aria-checked', 'true');
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'Style' }), {
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Modern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2 filters' }));

    expect(mocks.push).toHaveBeenCalledWith('/designers?citySlugs=mumbai&themeSlugs=modern');
  });
  it('removes one applied chip without losing the current search or sort', () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({
          q: 'oak',
          citySlugs: 'mumbai',
          themeSlugs: 'modern',
          sort: 'avgRating:desc',
        })}
        options={options}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mumbai filter' }));

    expect(mocks.push).toHaveBeenCalledWith(
      '/designers?q=oak&themeSlugs=modern&sort=avgRating%3Adesc',
    );
  });
  it('clears an applied search without dropping active filters', () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({ q: 'oak', citySlugs: 'mumbai' })}
        options={options}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(mocks.push).toHaveBeenCalledWith('/designers?citySlugs=mumbai');
  });
  it('disables facet groups with no available options', () => {
    render(<DesignerDiscoveryFilters query={parseDesignerParams({})} options={options} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Designer filters' }), { button: 0 });

    expect(screen.getByRole('menuitem', { name: 'Locality' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
  it('applies a quick designer type without dropping selected facets', () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({ citySlugs: 'mumbai' })}
        options={options}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Studios' }));

    expect(mocks.push).toHaveBeenCalledWith('/designers?citySlugs=mumbai&entityType=company');
  });
  it('links actual profiles and renders accurate verification, projects and ratings', () => {
    render(<DesignerDiscoveryResults result={result} query={parseDesignerParams({})} />);
    const portfolioCard = screen.getByRole('link', { name: 'View Oak Studio portfolio' });
    expect(portfolioCard).toHaveAttribute('href', '/d/oak-studio');
    expect(portfolioCard).toHaveClass('cursor-pointer');
    expect(screen.getByAltText('Oak Studio portfolio cover')).toBeVisible();
    expect(screen.queryByText('View profile')).toBeNull();
    expect(screen.getByText('KYC verified')).toBeVisible();
    expect(screen.getByText('4.8 / 5 · 8 reviews')).toBeVisible();
    const googleRating = screen.getByLabelText('Google Business rating');
    expect(googleRating).toBeVisible();
    expect(googleRating).toHaveTextContent('Google 4.9 · 127 ratings');
    expect(googleRating.querySelector('svg')).toBeInTheDocument();
    expect(googleRating.querySelector('.fill-rating')).toBeInTheDocument();
    expect(screen.getByText('8 years of experience · 12 projects')).toBeVisible();
    expect(screen.getByText('Calm spaces for everyday living')).toBeVisible();
    expect(screen.queryByText('Thoughtful homes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load more designers' })).toBeVisible();
  });
  it('falls back to the profile bio when a legacy result has no tagline', () => {
    render(
      <DesignerDiscoveryResults
        result={{ ...result, hits: [{ ...designer, tagline: null }] }}
        query={parseDesignerParams({})}
      />,
    );

    expect(screen.getByText('Thoughtful homes')).toBeVisible();
  });
  it('uses a singular result label for one matching designer', () => {
    render(
      <DesignerDiscoveryResults
        result={{ ...result, estimatedTotalHits: 1 }}
        query={parseDesignerParams({ q: 'oak' })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('1 designer found');
  });
  it('loads and appends the next designer page without replacing current results', async () => {
    const nextDesigner = {
      ...designer,
      id: 'designer-2',
      slug: 'nest-interiors',
      displayName: 'Nest Interiors',
    };
    mocks.fetchDesignerSearch.mockResolvedValue({
      ...result,
      hits: [nextDesigner],
      page: 2,
    });

    render(<DesignerDiscoveryResults result={result} query={parseDesignerParams({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more designers' }));

    expect(await screen.findByRole('article', { name: 'Nest Interiors' })).toBeVisible();
    expect(screen.getByRole('article', { name: 'Oak Studio' })).toBeVisible();
    await waitFor(() =>
      expect(mocks.fetchDesignerSearch).toHaveBeenCalledWith({
        ...parseDesignerParams({}),
        page: 2,
      }),
    );
    expect(screen.queryByRole('button', { name: 'Load more designers' })).toBeNull();
  });
  it('keeps current results and offers a retry when loading the next page fails', async () => {
    mocks.fetchDesignerSearch.mockRejectedValueOnce(new Error('Search unavailable'));

    render(<DesignerDiscoveryResults result={result} query={parseDesignerParams({})} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more designers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load more designers. Please try again.',
    );
    expect(screen.getByRole('article', { name: 'Oak Studio' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load more designers' })).toBeEnabled();
  });
  it('drops appended pages when the URL-backed query changes', async () => {
    const nextDesigner = {
      ...designer,
      id: 'designer-2',
      slug: 'nest-interiors',
      displayName: 'Nest Interiors',
    };
    mocks.fetchDesignerSearch.mockResolvedValue({
      ...result,
      hits: [nextDesigner],
      page: 2,
    });
    const { rerender } = render(
      <DesignerDiscoveryResults
        key="all-designers"
        result={result}
        query={parseDesignerParams({})}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load more designers' }));
    expect(await screen.findByRole('article', { name: 'Nest Interiors' })).toBeVisible();

    rerender(
      <DesignerDiscoveryResults
        key="oak-search"
        result={{ ...result, hits: [designer], estimatedTotalHits: 1 }}
        query={parseDesignerParams({ q: 'oak' })}
      />,
    );

    expect(screen.queryByRole('article', { name: 'Nest Interiors' })).toBeNull();
    expect(screen.getByRole('article', { name: 'Oak Studio' })).toBeVisible();
  });
  it('never links a missing slug or shows a zero-review rating as a real rating', () => {
    render(
      <DesignerDiscoveryResults
        result={{
          ...result,
          hits: [
            { ...designer, slug: null },
            {
              ...designer,
              id: 'another',
              slug: 'new-studio',
              displayName: 'New Studio',
              reviewCount: 0,
              googleRating: null,
              googleRatingCount: null,
              isKycVerified: false,
            },
          ],
        }}
        query={parseDesignerParams({})}
      />,
    );
    expect(screen.queryByRole('link', { name: 'View Oak Studio portfolio' })).toBeNull();
    expect(screen.getByText('No reviews yet')).toBeVisible();
    expect(screen.queryByText(/^Google /)).toBeNull();
    expect(screen.queryByText('KYC verified')).toBeNull();
  });
  it('provides a way back from an empty page and retains active filters', () => {
    render(
      <DesignerDiscoveryResults
        result={{ ...result, hits: [], page: 2, estimatedTotalHits: 24 }}
        query={parseDesignerParams({ q: 'oak', citySlugs: 'mumbai', page: '2' })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No designers found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/designers?q=oak&citySlugs=mumbai',
    );
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull();
  });
  it('submits changed search at page one while retaining selected city and sort', async () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({ q: 'old', citySlugs: 'mumbai', page: '3' })}
        options={options}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search designers' }), {
      target: { value: 'new' },
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sort designers' }), { button: 0 });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Most reviewed' }));
    fireEvent.submit(screen.getByRole('search', { name: 'Find designers' }));
    expect(mocks.push).toHaveBeenLastCalledWith(
      '/designers?q=new&citySlugs=mumbai&sort=reviewCount%3Adesc',
    );
  });
  it('updates inputs when navigation changes the URL-backed form key', () => {
    const { rerender } = render(
      <DesignerDiscoveryFilters
        key="first"
        query={parseDesignerParams({ q: 'first' })}
        options={options}
      />,
    );
    rerender(
      <DesignerDiscoveryFilters
        key="second"
        query={parseDesignerParams({ q: 'second', sort: 'avgRating:desc' })}
        options={options}
      />,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('second');
    expect(screen.getByRole('button', { name: 'Sort designers' })).toHaveTextContent(
      'Highest rated',
    );
  });
  it('retries a failed server render while preserving the current URL', () => {
    const reset = vi.fn();
    render(<DesignersError reset={reset} />);
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
