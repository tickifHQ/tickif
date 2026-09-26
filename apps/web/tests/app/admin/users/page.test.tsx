import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchUsers: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/admin-activity-api', () => ({ fetchAdminUsers: mocks.fetchUsers }));
vi.mock('@/components/admin-users-filters', () => ({
  AdminUsersFilters: ({ query }: { query: unknown }) => (
    <div data-testid="filters">{JSON.stringify(query)}</div>
  ),
}));
vi.mock('@/components/admin-users-directory', () => ({
  AdminUsersDirectory: ({ users, error }: { users: { total: number }; error?: string }) => (
    <div data-testid="directory">{error ?? `total:${users.total}`}</div>
  ),
}));

const loaded = {
  items: [],
  page: 1,
  limit: 25,
  total: 12,
  totalPages: 1,
};

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mocks.fetchUsers.mockResolvedValue(loaded);
  });

  it('gates the page and server-loads combined validated filters', async () => {
    const { default: Page } = await import('../../../../app/(admin)/users/page');

    render(
      await Page({
        searchParams: Promise.resolve({
          page: '2',
          limit: '50',
          q: '  Anika  ',
          role: 'designer',
          status: 'active',
        }),
      }),
    );

    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(mocks.fetchUsers).toHaveBeenCalledWith(
      { page: 2, limit: 50, q: 'Anika', role: 'designer', status: 'active' },
      { headers: { cookie: 'session=valid' } },
    );
    expect(screen.getByTestId('filters')).toHaveTextContent(
      JSON.stringify({ q: 'Anika', role: 'designer', status: 'active' }),
    );
  });

  it('drops only invalid parameters while preserving valid filters', async () => {
    const { default: Page } = await import('../../../../app/(admin)/users/page');

    render(
      await Page({
        searchParams: Promise.resolve({
          page: '-4',
          limit: 'invalid',
          q: '',
          role: 'designer',
          status: 'unknown',
        }),
      }),
    );

    expect(mocks.fetchUsers).toHaveBeenCalledWith(
      { page: 1, limit: 25, role: 'designer' },
      { headers: { cookie: 'session=valid' } },
    );
  });

  it('shows safe retry guidance when the API fails or the cookie is missing', async () => {
    const { default: Page } = await import('../../../../app/(admin)/users/page');
    mocks.fetchUsers.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.4'));

    const first = render(await Page());
    expect(screen.getByTestId('directory')).toHaveTextContent(
      'Could not load the user directory. Try refreshing the page.',
    );
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    first.unmount();

    mocks.headers.mockResolvedValueOnce(new Headers());
    render(await Page());
    expect(screen.getByTestId('directory')).toHaveTextContent(
      'Your admin session could not be found. Please sign in again.',
    );
  });

  it('does not fetch user PII when the admin gate rejects the request', async () => {
    const { default: Page } = await import('../../../../app/(admin)/users/page');
    mocks.requireAuth.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.fetchUsers).not.toHaveBeenCalled();
  });
});
