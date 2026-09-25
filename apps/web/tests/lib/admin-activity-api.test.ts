import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserActivityResponse, AdminUsersResponse } from '@repo/contracts';
import { AdminActivityAccessError, fetchAdminActivitySummary, fetchAdminUserActivity, fetchAdminUsers } from '../../src/lib/admin-activity-api';

const mocks = vi.hoisted(() => ({ activityGet: vi.fn(), usersGet: vi.fn(), summaryGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      admin: {
        activity: {
          summary: { $get: mocks.summaryGet },
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
const summary = {
  users: 10,
  activeUsers: 8,
  enquiries: 4,
  openEnquiries: 2,
  projectViews: 30,
  profileViews: 20,
  searches: 12,
};

describe('fetchAdminActivitySummary', () => {
  beforeEach(() => mocks.summaryGet.mockReset());

  it('returns a validated summary and forwards the admin session without caching', async () => {
    mocks.summaryGet.mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));

    await expect(fetchAdminActivitySummary('session=valid')).resolves.toEqual(summary);
    expect(mocks.summaryGet).toHaveBeenCalledWith(
      {},
      { headers: { cookie: 'session=valid' }, init: { cache: 'no-store' } },
    );
  });

  it.each([401, 403])('reports denied admin access for HTTP %s', async (status) => {
    mocks.summaryGet.mockResolvedValue(new Response(null, { status }));

    await expect(fetchAdminActivitySummary('session=invalid')).rejects.toBeInstanceOf(
      AdminActivityAccessError,
    );
  });

  it('rejects malformed totals instead of rendering fabricated values', async () => {
    mocks.summaryGet.mockResolvedValue(
      new Response(JSON.stringify({ ...summary, searches: null }), { status: 200 }),
    );

    await expect(fetchAdminActivitySummary('session=valid')).rejects.toThrow(
      'platform summary response was invalid',
    );
  });
});

