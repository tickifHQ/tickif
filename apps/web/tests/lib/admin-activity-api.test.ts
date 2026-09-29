import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserActivityResponse, AdminUsersResponse } from '@repo/contracts';
import { fetchAdminUserActivity, fetchAdminUsers } from '../../src/lib/admin-activity-api';

const mocks = vi.hoisted(() => ({ activityGet: vi.fn(), usersGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      admin: {
        activity: {
          users: {
            $get: mocks.usersGet,
            ':id': { activity: { $get: mocks.activityGet } },
          },
        },
      },
    },
  },
}));

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

const users: AdminUsersResponse = {
  items: [],
  page: 2,
  limit: 50,
  total: 0,
  totalPages: 0,
};

const activity: AdminUserActivityResponse = {
  searches: [],
  projectViews: [],
  profileViews: [],
};

describe('admin activity API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards combined directory filters and validates the response', async () => {
    mocks.usersGet.mockResolvedValue(response(users));

    await expect(
      fetchAdminUsers(
        { page: 2, limit: 50, q: 'Anika', role: 'designer', status: 'active' },
        { headers: { cookie: 'session=valid' } },
      ),
    ).resolves.toEqual(users);
    expect(mocks.usersGet).toHaveBeenCalledWith(
      {
        query: {
          page: '2',
          limit: '50',
          q: 'Anika',
          role: 'designer',
          status: 'active',
        },
      },
      { headers: { cookie: 'session=valid' } },
    );
  });

  it('loads activity by arbitrary user id and rejects invalid payloads', async () => {
    mocks.activityGet.mockResolvedValueOnce(response(activity));

    await expect(fetchAdminUserActivity('user_external_42')).resolves.toEqual(activity);
    expect(mocks.activityGet).toHaveBeenCalledWith({ param: { id: 'user_external_42' } });

    mocks.activityGet.mockResolvedValueOnce(response({ searches: 'invalid' }));
    await expect(fetchAdminUserActivity('user_external_42')).rejects.toThrow(
      'Could not load this user activity.',
    );
  });

  it('uses the safe API error message for failed directory requests', async () => {
    mocks.usersGet.mockResolvedValue(
      response({ error: { message: 'Admin role required' } }, false),
    );

    await expect(fetchAdminUsers({ page: 1, limit: 25 })).rejects.toThrow('Admin role required');
  });
});
