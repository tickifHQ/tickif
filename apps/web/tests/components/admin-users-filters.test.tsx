import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersFilters } from '../../src/components/admin-users-filters';

const mocks = vi.hoisted(() => ({
  pathname: '/users',
  push: vi.fn(),
  search: 'role=designer&status=active&page=4&limit=50',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

describe('AdminUsersFilters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves combined filters and resets pagination when searching', () => {
    render(<AdminUsersFilters query={{ role: 'designer', status: 'active' }} />);

    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Anika' } });
    const searchButton = screen.getByRole('button', { name: 'Search' });
    expect(searchButton).toHaveClass('bg-button-fancy', 'shadow-button-fancy');
    expect(searchButton.querySelector('svg')).toBeInTheDocument();
    fireEvent.click(searchButton);

    expect(mocks.push).toHaveBeenCalledWith(
      '/users?role=designer&status=active&page=1&limit=50&q=Anika',
    );
  });

  it('updates one filter without losing the others and resets to page one', () => {
    render(<AdminUsersFilters query={{ role: 'designer', status: 'active' }} />);

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'admin' } });

    expect(mocks.push).toHaveBeenCalledWith('/users?role=admin&status=active&page=1&limit=50');
  });

  it('places Search immediately before Clear in the right-side action area', () => {
    render(<AdminUsersFilters query={{ role: 'designer', status: 'active' }} />);

    const statusSelect = screen.getByLabelText('Status');
    const searchButton = screen.getByRole('button', { name: 'Search' });
    const clearButton = screen.getByRole('button', { name: 'Clear' });

    expect(statusSelect.compareDocumentPosition(searchButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(searchButton.nextElementSibling).toBe(clearButton);
  });

  it('clears all directory filters while retaining page size', () => {
    render(<AdminUsersFilters query={{ q: 'Anika', role: 'designer', status: 'active' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(mocks.push).toHaveBeenCalledWith('/users?page=1&limit=50');
  });
});
