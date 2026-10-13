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
  it('clears visitor criteria without escaping the private Following scope', () => {
    mock.params = new URLSearchParams('view=following&q=teak&city=chennai&page=2');
    render(<FeedFilters presentation="visitor" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Filters/ }), { button: 0 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear all' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?view=following&q=teak');
  });
  it.each([
    { label: 'right', x: 260, expected: 60 },
    { label: 'left', x: 60, expected: -40 },
    { label: 'already visible', x: 150, expected: 0 },
  ])('reveals a $label focused visitor category within its own rail', ({ x, expected }) => {
    render(
      <FeedFilters
        presentation="visitor"
        options={{ room: [{ slug: 'living-room', label: 'Living room' }] }}
      />,
    );
    const rail = screen.getByRole('group', { name: 'Feed categories' });
    const category = screen.getByRole('button', { name: 'Living rooms' });
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 200, 46));
    vi.spyOn(category, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, 0, 100, 38));
    rail.scrollLeft = 100;
    fireEvent.focus(category);
    expect(rail.scrollLeft).toBe(100 + expected);
    expect(mock.push).not.toHaveBeenCalled();
  });

  it('scrolls only visitor photo chips while keeping feed views, divider and the reused Filters control outside', () => {
    mock.params = new URLSearchParams('city=chennai&room=living-room');
    render(
      <FeedFilters
        presentation="visitor"
        options={{ room: [{ slug: 'living-room', label: 'Living room' }] }}
      />,
    );
    const rail = screen.getByRole('group', { name: 'Feed categories' });
    expect(rail).toHaveClass('overflow-x-auto', 'overscroll-x-contain');
    const filters = screen.getByRole('button', { name: /^Filters/ });
    expect(rail).not.toContainElement(filters);
    expect(rail).not.toContainElement(screen.getByRole('button', { name: 'For you' }));
    expect(filters.querySelector('svg.lucide-sliders-horizontal')).not.toBeNull();
    expect(screen.queryByLabelText('Applied filters')).toBeNull();
    const living = screen.getByRole('button', { name: 'Living rooms' });
    expect(living).toHaveClass('h-9.5', 'pl-1', 'pr-3.5', 'bg-card');
    expect(living).toHaveAttribute('aria-pressed', 'true');
    expect(living.querySelector('img')).toHaveAttribute('src', '/images/landing/filter-living.png');
    expect(
      screen.getByRole('group', { name: 'Feed views' }).querySelector('[data-slot=separator]'),
    ).toHaveAttribute('data-orientation', 'vertical');
  });

  it('keeps For you compact and keyboard accessible when no categories are available', () => {
    render(<FeedFilters presentation="visitor" forYouActive />);
    const forYou = screen.getByRole('button', { name: 'For you' });
    expect(forYou).toHaveClass('h-9.5', 'px-3.5');
    expect(forYou).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('group', { name: 'Feed views' }).querySelector('[data-slot=separator]'),
    ).toBeNull();
  });

  it('reuses the multi-select dropdown in the visitor view and clears its view mode without dropping search', async () => {
    mock.params = new URLSearchParams('city=chennai&view=nearby&q=teak');
    render(
      <FeedFilters
        presentation="visitor"
        options={{
          city: [{ slug: 'chennai', label: 'Chennai' }],
          material: [{ slug: 'wood', label: 'Wood' }],
        }}
        facetDistribution={{ materials: { wood: 3 } }}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Filters/ }), { button: 0 });
    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'Material' }), {
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Wood/ }));
    expect(mock.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: /Apply/ }));
    expect(mock.push).toHaveBeenLastCalledWith('/?view=nearby&q=teak&city=chennai&material=wood');
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Filters/ }), { button: 0 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear all' }));
    expect(mock.push).toHaveBeenLastCalledWith('/?q=teak');
  });

  it('deselects a visitor category without losing the query, home or location filters', () => {
    mock.params = new URLSearchParams('q=teak&city=chennai&bhk=3-bhk&room=living-room&page=3');
    render(
      <FeedFilters
        presentation="visitor"
        options={{ room: [{ slug: 'living-room', label: 'Living room' }] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Living rooms' }));
    expect(mock.push).toHaveBeenCalledWith('/?q=teak&city=chennai&bhk=3-bhk');
  });
  it('groups only known under-10L budget bands and never includes a crossing range', () => {
    mock.params = new URLSearchParams({ city: 'chennai', room: 'living-room' });
    render(
      <FeedFilters
        presentation="visitor"
        options={{
          budgetBand: [
            { slug: 'budget', label: 'Under ₹5L' },
            { slug: '5l-10l', label: '₹5L - ₹10L' },
            { slug: 'moderate', label: '₹5L - ₹15L' },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Under ₹10L' }));
    expect(mock.push).toHaveBeenCalledWith('/?city=chennai&budgetBand=budget%2C5l-10l');
  });
  it('restores the saved feed through For you and keeps additional views outside the chip scroller', () => {
    render(
      <FeedFilters
        presentation="visitor"
        forYouActive
        leadingActions={<a href="/home?feed=custom&view=following">Following 2</a>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'For you' }));
    expect(mock.push).toHaveBeenCalledWith('/home');
    expect(screen.getByRole('group', { name: 'Feed categories' })).not.toContainElement(
      screen.getByRole('link', { name: 'Following 2' }),
    );
  });
  it('switches visitor categories exclusively while keeping home and location filters', () => {
    mock.params = new URLSearchParams({
      city: 'chennai',
      bhk: '3-bhk',
      budgetBand: 'budget,5l-10l',
      view: 'nearby',
    });
    render(
      <FeedFilters
        presentation="visitor"
        options={{ room: [{ slug: 'modular-kitchen', label: 'Kitchen' }] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kitchens' }));
    expect(mock.push).toHaveBeenCalledWith(
      '/?view=nearby&city=chennai&bhk=3-bhk&room=modular-kitchen',
    );
  });
  it('keeps landing room categories in design order with thumbnails, even when empty', () => {
    render(
      <FeedFilters
        presentation="landing"
        options={{
          room: [
            { slug: 'modular-kitchen', label: 'Modular Kitchen' },
            { slug: 'living-room', label: 'Living Room' },
          ],
          material: [{ slug: 'wood', label: 'Wood' }],
        }}
        facetDistribution={{ rooms: {}, materials: { wood: 20 } }}
      />,
    );
    const living = screen.getByRole('button', { name: 'Living rooms' });
    expect(living.querySelector('img')).toHaveAttribute('src', '/images/landing/filter-living.png');
    expect(screen.queryByRole('button', { name: 'Wood' })).toBeNull();
    fireEvent.click(living);
    expect(mock.push).toHaveBeenCalledWith('/?room=living-room');
  });
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

    expect(screen.getByRole('menuitem', { name: /Apply/ })).toHaveTextContent('(2)');
    expect(mock.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: /Apply/ }));
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
    expect(screen.getByRole('menuitem', { name: 'Apply' })).not.toHaveTextContent('(0)');
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

  it('shows live material and tag options with their matching counts', async () => {
    render(
      <FeedFilters
        options={{
          material: [{ slug: 'wood', label: 'Wood' }],
          tag: [{ slug: 'sunlit', label: 'Sunlit' }],
        }}
        facetDistribution={{ materials: { wood: 6 }, tags: { sunlit: 3 } }}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Filters' }), { button: 0 });
    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'Material' }), {
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('menuitemcheckbox', { name: /Wood/ })).toHaveTextContent('6');

    fireEvent.pointerMove(screen.getByRole('menuitem', { name: 'Tag' }), {
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Sunlit/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Apply/ }));

    expect(mock.push).toHaveBeenCalledWith('/?tag=sunlit');
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
