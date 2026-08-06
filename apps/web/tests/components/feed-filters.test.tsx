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

  it('adds a facet value to the URL and shows its count', () => {
    render(
      <FeedFilters
        options={{ city: [{ slug: 'mumbai', label: 'Mumbai' }] }}
        facetDistribution={{ citySlug: { mumbai: 4 } }}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'City' }), { button: 0 });
    expect(screen.getByRole('menuitemcheckbox', { name: /Mumbai/ })).toHaveTextContent('4');
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Mumbai/ }));

    expect(mock.push).toHaveBeenCalledWith('/?city=mumbai');
  });

  it('disables zero-count options without hiding them', () => {
    render(
      <FeedFilters
        options={{ city: [{ slug: 'mumbai', label: 'Mumbai' }] }}
        facetDistribution={{ citySlug: { mumbai: 0 } }}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'City' }), { button: 0 });
    expect(screen.getByRole('menuitemcheckbox', { name: /Mumbai/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
  });
});
