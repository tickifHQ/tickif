import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserActivityResponse, AdminUsersResponse } from '@repo/contracts';
import { AdminUsersDirectory } from '../../src/components/admin-users-directory';

const mocks = vi.hoisted(() => ({
  fetchActivity: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/users',
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/admin-activity-api', () => ({
  fetchAdminUserActivity: mocks.fetchActivity,
}));

const firstUser: AdminUsersResponse['items'][number] = {
  id: 'user_external_1',
  name: 'Anika Sharma',
  email: 'anika@example.com',
  phoneNumber: '+919876543210',
  role: 'designer',
  status: 'active',
  banned: false,
  projectViews: 12,
  profileViews: 8,
  searches: 21,
  enquiries: 3,
  createdAt: '2026-01-02T10:00:00.000Z',
  lastActiveAt: null,
};

const secondUser: AdminUsersResponse['items'][number] = {
  ...firstUser,
  id: 'user_external_2',
  name: 'Dev Mehta',
  email: 'dev@example.com',
  phoneNumber: null,
  role: 'visitor',
  status: 'suspended',
  banned: true,
  lastActiveAt: '2026-09-20T10:00:00.000Z',
};

function users(items = [firstUser]): AdminUsersResponse {
  return { items, page: 1, limit: 25, total: items.length, totalPages: 1 };
}

const activity: AdminUserActivityResponse = {
  searches: [
    { endpoint: 'projects', query: 'warm minimal kitchen', createdAt: '2026-09-20T09:00:00.000Z' },
  ],
  projectViews: [
    {
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Courtyard House',
      createdAt: '2026-09-20T08:00:00.000Z',
    },
  ],
  profileViews: [
    {
      designerProfileId: '22222222-2222-4222-8222-222222222222',
      displayName: 'North Star Studio',
      createdAt: '2026-09-20T07:00:00.000Z',
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe('AdminUsersDirectory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders identity, lifecycle, totals, and nullable activity safely', () => {
    render(<AdminUsersDirectory users={users([firstUser, secondUser])} />);

    expect(screen.getByText('Anika Sharma')).toBeInTheDocument();
    expect(screen.getByText('anika@example.com')).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('No recorded activity')).toBeInTheDocument();
    expect(screen.getByText('No phone number')).toBeInTheDocument();
    expect(screen.getByText('Banned')).toBeInTheDocument();
    expect(screen.getAllByText('Searches')[0]?.nextSibling).toHaveTextContent('21');
    expect(screen.getAllByText('Projects')[0]?.nextSibling).toHaveTextContent('12');
    expect(screen.getAllByText('Profiles')[0]?.nextSibling).toHaveTextContent('8');
    expect(screen.getAllByText('Enquiries')[0]?.nextSibling).toHaveTextContent('3');
  });

  it('shows populated recent history and independent empty states in the activity drawer', async () => {
    const user = userEvent.setup();
    mocks.fetchActivity.mockResolvedValue({ ...activity, profileViews: [] });
    render(<AdminUsersDirectory users={users()} />);

    fireEvent.click(screen.getByRole('button', { name: 'View recent activity for Anika Sharma' }));

    expect(await screen.findByText('warm minimal kitchen')).toBeInTheDocument();
    expect(screen.getByText(/not lifetime totals/i)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Projects 1/ }));
    expect(screen.getByText('Courtyard House')).toBeInTheDocument();
    expect(screen.getByText(/Project 11111111/)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Profiles 0/ }));
    expect(screen.getByText('No recorded profile views')).toBeInTheDocument();
  });

  it('shows a retryable directory error and a deliberate empty result', () => {
    const first = render(
      <AdminUsersDirectory
        users={users([])}
        error="Could not load the user directory. Try refreshing the page."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refresh).toHaveBeenCalled();
    first.unmount();

    render(<AdminUsersDirectory users={users([])} />);
    expect(screen.getByText('No users found')).toBeInTheDocument();
  });

  it('retries a failed activity request', async () => {
    mocks.fetchActivity
      .mockRejectedValueOnce(new Error('Could not load this user activity.'))
      .mockResolvedValueOnce(activity);
    render(<AdminUsersDirectory users={users()} />);

    fireEvent.click(screen.getByRole('button', { name: 'View recent activity for Anika Sharma' }));
    expect(await screen.findByText('Could not load this user activity.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('warm minimal kitchen')).toBeInTheDocument();
    expect(mocks.fetchActivity).toHaveBeenCalledTimes(2);
  });

  it('never renders stale activity after closing one user and opening another', async () => {
    const first = deferred<AdminUserActivityResponse>();
    const second = deferred<AdminUserActivityResponse>();
    mocks.fetchActivity.mockImplementation((userId: string) =>
      userId === firstUser.id ? first.promise : second.promise,
    );
    render(<AdminUsersDirectory users={users([firstUser, secondUser])} />);

    fireEvent.click(screen.getByRole('button', { name: 'View recent activity for Anika Sharma' }));
    expect(screen.getByLabelText('Loading user activity')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'View recent activity for Dev Mehta' }));

    second.resolve({
      searches: [
        {
          endpoint: 'designers',
          query: 'Dev current query',
          createdAt: '2026-09-21T09:00:00.000Z',
        },
      ],
      projectViews: [],
      profileViews: [],
    });
    expect(await screen.findByText('Dev current query')).toBeInTheDocument();
    first.resolve(activity);

    await waitFor(() => expect(screen.queryByText('warm minimal kitchen')).not.toBeInTheDocument());
    expect(screen.getAllByText('Dev Mehta')).toHaveLength(2);
  });
});
