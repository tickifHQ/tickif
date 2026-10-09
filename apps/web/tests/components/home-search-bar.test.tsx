import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSearchBar, LandingHeaderSearch } from '../../src/components/home-search-bar';

const mock = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  suggestGet: vi.fn(),
  taxonomyGet: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => mock.params,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      taxonomy: { terms: { $get: mock.taxonomyGet } },
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
  filters: [
    { kind: 'space', filterKey: 'room', slug: 'kitchen', label: 'Kitchen' },
    { kind: 'style', filterKey: 'theme', slug: 'warm', label: 'Warm' },
    { kind: 'material', filterKey: 'material', slug: 'wood', label: 'Wood' },
    { kind: 'tag', filterKey: 'tag', slug: 'sunlit', label: 'Sunlit' },
  ],
  processingTimeMs: 3,
};

describe('HomeSearchBar', () => {
  it('submits the selected API city together with the query and preserves other filters', async () => {
    vi.useRealTimers();
    mock.params = new URLSearchParams('room=kitchen&page=3');
    render(<HomeSearchBar variant="hero" cities={[{ slug: 'chennai', label: 'Chennai' }]} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Search city' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Chennai' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'teak' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(mock.push).toHaveBeenCalledWith('/?room=kitchen&city=chennai&q=teak');
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mock.params = new URLSearchParams();
    window.localStorage.clear();
    mock.taxonomyGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        terms: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            slug: 'chennai',
            label: 'Chennai',
            parentId: null,
          },
        ],
      }),
    });
    mock.suggestGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => suggestions,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads header cities from taxonomy and supports keyboard search with the selected city', async () => {
    vi.useRealTimers();
    mock.params = new URLSearchParams('city=chennai&room=kitchen&page=3');
    render(<LandingHeaderSearch />);
    expect(
      screen.queryByRole('button', { name: 'Focus search (Control or Command K)' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Header search city' })).toHaveTextContent(
      'Chennai',
    );
    expect(mock.taxonomyGet).toHaveBeenCalledWith(
      { query: { kind: 'city' } },
      { init: { signal: expect.any(AbortSignal) } },
    );
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('searchbox');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'teak' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(mock.push).toHaveBeenCalledWith('/?city=chennai&room=kitchen&q=teak');
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
    expect(screen.getByRole('button', { name: 'Kitchen, Space' })).toBeInTheDocument();
    expect(mock.suggestGet).toHaveBeenCalledWith(
      { query: { q: 'kitchen' } },
      { init: { signal: expect.any(AbortSignal) } },
    );
    expect(screen.getByRole('group', { name: 'Search suggestions' })).toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-autocomplete');
    expect(input).not.toHaveAttribute('aria-controls');
  });

  it.each(['city=mumbai,chennai', 'city=mumbai&city=chennai'])(
    'preserves multiple city filters in header searches: %s',
    (cityParams) => {
      mock.params = new URLSearchParams(`${cityParams}&page=3`);
      render(<HomeSearchBar variant="header" cities={[{ slug: 'chennai', label: 'Chennai' }]} />);
      expect(screen.getByRole('combobox')).toHaveTextContent('Multiple cities');
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'teak' } });
      fireEvent.submit(screen.getByRole('search'));
      const expected = new URLSearchParams(cityParams);
      expected.set('q', 'teak');
      expect(mock.push).toHaveBeenCalledWith(`/?${expected.toString()}`);
    },
  );

  it('shows a custom city on project suggestions when no taxonomy city exists', async () => {
    mock.suggestGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...suggestions,
        projects: [
          {
            ...suggestions.projects[0],
            citySlug: null,
            cityName: 'Pondicherry',
          },
        ],
      }),
    });
    render(<HomeSearchBar />);

    const input = screen.getByRole('searchbox', { name: 'Search homes' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'kitchen' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(screen.getByText('Studio One · Pondicherry')).toBeInTheDocument();
  });

  it('applies a matching filter entity and removes the free-text query', async () => {
    mock.params = new URLSearchParams('q=kitchen&city=mumbai&page=3');
    render(<HomeSearchBar initialQuery="kitchen" />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.focus(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen, Space' }));

    expect(mock.push).toHaveBeenCalledWith('/?city=mumbai&room=kitchen');
  });

  it('preserves all repeated and comma-separated filters when applying a suggestion', async () => {
    mock.params = new URLSearchParams('q=kitchen&room=bedroom,living-room&room=bathroom&page=3');
    render(<HomeSearchBar initialQuery="kitchen" basePath="/home" />);

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Search homes' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kitchen, Space' }));

    expect(mock.push).toHaveBeenCalledWith('/home?room=bedroom%2Cliving-room%2Cbathroom%2Ckitchen');
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
    expect(mock.push).toHaveBeenCalledWith('/');
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

  it('keeps searches on the configured feed base instead of the public homepage', () => {
    render(<HomeSearchBar basePath="/home" />);
    const input = screen.getByRole('searchbox', { name: 'Search homes' });

    fireEvent.change(input, { target: { value: 'sunlit' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(mock.push).toHaveBeenCalledWith('/home?q=sunlit');
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
    const filters = suggestions.filters.map((suggestion) =>
      screen.getByRole('button', {
        name: `${suggestion.label}, ${suggestion.kind.charAt(0).toUpperCase()}${suggestion.kind.slice(1)}`,
      }),
    );
    const designer = screen.getByRole('link', { name: /4 projects/ });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(project).toHaveFocus();

    fireEvent.keyDown(project, { key: 'ArrowDown' });
    expect(filters[0]).toHaveFocus();

    for (const filter of filters) fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(designer).toHaveFocus();

    fireEvent.keyDown(designer, { key: 'ArrowUp' });
    expect(filters.at(-1)).toHaveFocus();

    fireEvent.keyDown(filters.at(-1)!, { key: 'Escape' });
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
