import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DesignerHit, SearchDesignersResponse } from '@repo/contracts';
import { DesignerDiscoveryResults } from '../../src/components/designer-discovery-results';
import { DesignerDiscoveryFilters } from '../../src/components/designer-discovery-filters';
import DesignersError from '../../app/(public)/designers/error';
import { parseDesignerParams } from '../../src/lib/designer-discovery-params';

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => mocks }));
const designer: DesignerHit = {
  id: 'designer-1',
  slug: 'oak-studio',
  displayName: 'Oak Studio',
  bio: 'Thoughtful homes',
  entityType: 'company',
  citySlugs: ['mumbai'],
  localitySlugs: [],
  scopeSlugs: ['full-home'],
  themeSlugs: [],
  yearsExperience: 8,
  projectCount: 12,
  avgRating: 4.75,
  reviewCount: 8,
  isKycVerified: true,
  logoUrl: null,
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
  scopeSlugs: [],
  themeSlugs: [],
};
beforeEach(() => vi.clearAllMocks());

describe('designer discovery', () => {
  it('clears unsaved filters even when the URL is already the default directory', () => {
    render(<DesignerDiscoveryFilters query={parseDesignerParams({})} options={options} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unsaved' } });
    fireEvent.click(screen.getByRole('link', { name: 'Clear filters' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
  it('links actual profiles and renders accurate verification, projects and ratings', () => {
    render(<DesignerDiscoveryResults result={result} query={parseDesignerParams({})} />);
    expect(screen.getByRole('link', { name: 'View Oak Studio profile' })).toHaveAttribute(
      'href',
      '/d/oak-studio',
    );
    expect(screen.getByText('KYC verified')).toBeVisible();
    expect(screen.getByText('4.8 / 5 · 8 reviews')).toBeVisible();
    expect(screen.getByText('8 years of experience · 12 projects')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/designers?page=2',
    );
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
              isKycVerified: false,
            },
          ],
        }}
        query={parseDesignerParams({})}
      />,
    );
    expect(screen.queryByRole('link', { name: 'View Oak Studio profile' })).toBeNull();
    expect(screen.getByText('No reviews yet')).toBeVisible();
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
  it('submits changed filters at page one while retaining selected city and sort', () => {
    render(
      <DesignerDiscoveryFilters
        query={parseDesignerParams({ q: 'old', citySlugs: 'mumbai', page: '3' })}
        options={options}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search designers' }), {
      target: { value: 'new' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: 'reviewCount:desc' },
    });
    fireEvent.submit(screen.getByRole('search', { name: 'Find designers' }));
    expect(mocks.push).toHaveBeenCalledWith(
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
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('avgRating:desc');
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
