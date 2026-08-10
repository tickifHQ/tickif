import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FeedFilters } from '../../src/components/feed-filters';

const mock = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mock.push }),
  useSearchParams: () => mock.params,
}));

describe('FeedFilters', () => {
  beforeEach(() => {
    mock.params = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('keeps the menu open for multiple selections and applies them together', async () => {
    render(
      <FeedFilters
        options={{
          city: [{ slug: 'mumbai', label: 'Mumbai' }],
          bhk: [{ slug: '3bhk', label: '3 BHK' }],
        }}
        facetDistribution={{ citySlug: { mumbai: 4 }, bhkSlug: { '3bhk': 2 } }}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filters' }), { button: 0 });
    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'City' }), {
      pointerType: 'mouse',
    });
    const cityOption = await screen.findByRole('menuitemcheckbox', { name: /Mumbai/ });
    expect(cityOption).toHaveTextContent('4');
    fireEvent.click(cityOption);
    expect(cityOption).toHaveAttribute('aria-checked', 'true');
    expect(mock.push).not.toHaveBeenCalled();

    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'BHK' }), {
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /3 BHK/ }));

    expect(screen.getByRole('button', { name: /Apply/ })).toHaveTextContent('(2)');
    expect(mock.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Apply/ }));
    expect(mock.push).toHaveBeenCalledWith('/?city=mumbai&bhk=3bhk');
  });

  it('disables zero-count options without hiding them', async () => {
    render(
      <FeedFilters
        options={{
          city: [
            { slug: 'mumbai', label: 'Mumbai' },
            { slug: 'pune', label: 'Pune' },
          ],
        }}
        facetDistribution={{ citySlug: { mumbai: 4 } }}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filters' }), { button: 0 });
    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'City' }), {
      pointerType: 'mouse',
    });
    expect(screen.getByRole('button', { name: 'Apply' })).not.toHaveTextContent('(0)');
    expect(await screen.findByRole('menuitemcheckbox', { name: /Mumbai/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitemcheckbox', { name: /Pune/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('renders live suggestion tags that apply their associated facet', () => {
    render(
      <FeedFilters
        options={{ theme: [{ slug: 'warm', label: 'Warm living rooms' }] }}
        facetDistribution={{ themes: { warm: 8 } }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Warm living rooms' }));

    expect(mock.push).toHaveBeenCalledWith('/?theme=warm');
  });

  it('replaces the active suggestion when another tag is selected', () => {
    const view = render(
      <FeedFilters
        options={{
          room: [{ slug: 'dining', label: 'Dining spaces' }],
          budgetBand: [{ slug: 'under-5l', label: 'Under ₹5L' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dining spaces' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?room=dining');

    mock.params = new URLSearchParams('room=dining');
    view.rerender(
      <FeedFilters
        options={{
          room: [{ slug: 'dining', label: 'Dining spaces' }],
          budgetBand: [{ slug: 'under-5l', label: 'Under ₹5L' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Under ₹5L' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?budgetBand=under-5l');
  });

  it('preserves dropdown filters while replacing only the active suggestion', () => {
    mock.params = new URLSearchParams('city=mumbai&bhk=3bhk');
    const options = {
      city: [{ slug: 'mumbai', label: 'Mumbai' }],
      bhk: [{ slug: '3bhk', label: '3 BHK' }],
      room: [{ slug: 'dining', label: 'Dining spaces' }],
      budgetBand: [{ slug: 'under-5l', label: 'Under ₹5L' }],
    };
    const view = render(<FeedFilters options={options} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dining spaces' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?city=mumbai&bhk=3bhk&room=dining');

    mock.params = new URLSearchParams('city=mumbai&bhk=3bhk&room=dining');
    view.rerender(<FeedFilters options={options} />);

    fireEvent.click(screen.getByRole('button', { name: 'Under ₹5L' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?city=mumbai&bhk=3bhk&budgetBand=under-5l');
  });

  it('ranks suggestion tags by available project count', () => {
    render(
      <FeedFilters
        options={{
          city: [
            { slug: 'mumbai', label: 'Mumbai' },
            { slug: 'pune', label: 'Pune' },
          ],
        }}
        facetDistribution={{ citySlug: { mumbai: 2, pune: 8 } }}
      />,
    );

    const suggestions = screen
      .getAllByRole('button')
      .filter((button) => ['Mumbai', 'Pune'].includes(button.textContent ?? ''));
    expect(suggestions.map((button) => button.textContent)).toEqual(['Pune', 'Mumbai']);
  });

  it('marks All active by default and clears every selected filter', () => {
    mock.params = new URLSearchParams('city=mumbai&theme=warm');
    render(
      <FeedFilters
        options={{
          city: [{ slug: 'mumbai', label: 'Mumbai' }],
          theme: [{ slug: 'warm', label: 'Warm living rooms' }],
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(mock.push).toHaveBeenCalledWith('/');
  });

  it('removes an applied chip and supports clear all', () => {
    mock.params = new URLSearchParams('city=mumbai&bhk=3bhk');
    render(
      <FeedFilters
        options={{
          city: [{ slug: 'mumbai', label: 'Mumbai' }],
          bhk: [{ slug: '3bhk', label: '3 BHK' }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Mumbai filter' }));
    expect(mock.push).toHaveBeenCalledWith('/?bhk=3bhk');

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(mock.push).toHaveBeenLastCalledWith('/');
  });

  it('restores applied chips when navigation changes the URL state', () => {
    const view = render(<FeedFilters options={{ city: [{ slug: 'mumbai', label: 'Mumbai' }] }} />);

    expect(screen.queryByRole('button', { name: 'Remove Mumbai filter' })).not.toBeInTheDocument();
    mock.params = new URLSearchParams('city=mumbai');
    view.rerender(<FeedFilters options={{ city: [{ slug: 'mumbai', label: 'Mumbai' }] }} />);

    expect(screen.getByRole('button', { name: 'Remove Mumbai filter' })).toBeInTheDocument();

    mock.params = new URLSearchParams();
    view.rerender(<FeedFilters options={{ city: [{ slug: 'mumbai', label: 'Mumbai' }] }} />);

    expect(screen.queryByRole('button', { name: 'Remove Mumbai filter' })).not.toBeInTheDocument();
  });
});
