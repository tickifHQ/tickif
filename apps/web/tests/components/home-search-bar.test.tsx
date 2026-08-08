import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSearchBar } from '../../src/components/home-search-bar';

const mock = vi.hoisted(() => ({
  push: vi.fn(),
  suggestGet: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mock.push }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      search: {
        suggest: { $get: mock.suggestGet },
      },
    },
  },
}));

const suggestions = {
  projects: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'warm-kitchen',
      title: 'Warm Kitchen',
      designerName: 'Studio One',
      citySlug: 'mumbai',
      coverImageUrl: null,
    },
  ],
  designers: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'studio-one',
      displayName: 'Studio One',
      citySlugs: ['mumbai'],
      logoUrl: null,
      projectCount: 4,
    },
  ],
  processingTimeMs: 3,
};

describe('HomeSearchBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.localStorage.clear();
    mock.suggestGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => suggestions,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows blended suggestions after the 150 ms debounce', async () => {
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kitchen' } });

    expect(mock.suggestGet).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(screen.getByText('Warm Kitchen')).toBeInTheDocument();
    expect(screen.getAllByText('Studio One').length).toBeGreaterThan(0);
    expect(mock.suggestGet).toHaveBeenCalledWith(
      { query: { q: 'kitchen' } },
      { init: { signal: expect.any(AbortSignal) } },
    );
  });

  it('submits the search to the homepage query surface', () => {
    render(<HomeSearchBar initialQuery="warm kitchen" />);

    fireEvent.submit(screen.getByRole('search'));

    expect(mock.push).toHaveBeenCalledWith('/?q=warm+kitchen');
  });

  it('resyncs the input when browser history changes the URL query', () => {
    const { rerender } = render(<HomeSearchBar initialQuery="sunlit" />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.change(input, { target: { value: 'Sarthak W' } });
    rerender(<HomeSearchBar initialQuery="Sarthak W" />);
    rerender(<HomeSearchBar initialQuery="sunlit" />);

    expect(input).toHaveValue('sunlit');
  });

  it('shows a persistent clear action only while the search has text', () => {
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'sunlit' } });
    const clearButton = screen.getByRole('button', { name: 'Clear search' });

    expect(clearButton).toHaveClass('text-primary', 'hover:bg-transparent');
    expect(clearButton).not.toHaveClass('bg-primary');

    fireEvent.click(clearButton);

    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('stores submitted queries and shows them when the empty search is focused', () => {
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sunlit' } });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByRole('option', { name: 'sunlit' })).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('runs a recent search when it is selected', () => {
    window.localStorage.setItem('tickif.homeSearchRecents.v1', JSON.stringify(['Sarthak W']));
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: 'Sarthak W' }));

    expect(input).toHaveValue('Sarthak W');
    expect(mock.push).toHaveBeenCalledWith('/?q=Sarthak+W');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
