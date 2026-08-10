import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSearchBar } from '../../src/components/home-search-bar';

const mock = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  suggestGet: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => mock.params,
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
    mock.params = new URLSearchParams();
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
    expect(screen.getByRole('group', { name: 'Search suggestions' })).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-autocomplete');
    expect(input).not.toHaveAttribute('aria-controls');
  });

  it('clears stale suggestions and shows loading immediately for a changed query', async () => {
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kitchen' } });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText(/No suggestions found/)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(screen.getByText('Warm Kitchen')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'bedroom' } });

    expect(screen.queryByText('Warm Kitchen')).not.toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('submits the search to the homepage query surface', () => {
    render(<HomeSearchBar initialQuery="warm kitchen" />);

    fireEvent.submit(screen.getByRole('search'));

    expect(mock.push).toHaveBeenCalledWith('/?q=warm+kitchen');
  });

  it('preserves active filters and resets pagination when submitting a search', () => {
    mock.params = new URLSearchParams('city=mumbai&bhk=3-bhk&page=4');
    render(<HomeSearchBar initialQuery="warm kitchen" />);

    fireEvent.submit(screen.getByRole('search'));

    expect(mock.push).toHaveBeenCalledWith('/?city=mumbai&bhk=3-bhk&q=warm+kitchen');
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

    expect(screen.getByRole('button', { name: 'sunlit' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Recent searches' })).toBeInTheDocument();
  });

  it('runs a recent search when it is selected', () => {
    window.localStorage.setItem('tickif.homeSearchRecents.v1', JSON.stringify(['Sarthak W']));
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('button', { name: 'Sarthak W' }));

    expect(input).toHaveValue('Sarthak W');
    expect(mock.push).toHaveBeenCalledWith('/?q=Sarthak+W');
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
  });

  it('walks the suggestion dropdown with the arrow keys', async () => {
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kitchen' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    const project = screen.getByRole('link', { name: /Warm Kitchen/ });
    const designer = screen.getByRole('link', { name: /4 projects/ });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(project).toHaveFocus();

    fireEvent.keyDown(project, { key: 'ArrowDown' });
    expect(designer).toHaveFocus();

    fireEvent.keyDown(designer, { key: 'ArrowUp' });
    expect(project).toHaveFocus();

    fireEvent.keyDown(project, { key: 'Escape' });
    expect(input).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Search suggestions' })).not.toBeInTheDocument();
  });

  it('walks recent searches with the arrow keys', () => {
    window.localStorage.setItem(
      'tickif.homeSearchRecents.v1',
      JSON.stringify(['Sarthak W', 'sunlit']),
    );
    render(<HomeSearchBar />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(screen.getByRole('button', { name: 'sunlit' })).toHaveFocus();
  });

  it('ignores stored recent searches when the persisted shape is invalid', () => {
    window.localStorage.setItem(
      'tickif.homeSearchRecents.v1',
      JSON.stringify(['Sarthak W', { query: 'unexpected shape' }]),
    );
    render(<HomeSearchBar />);

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Search homes' }));

    expect(screen.queryByRole('button', { name: 'Sarthak W' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
  });
});
