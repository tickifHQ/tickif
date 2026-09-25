import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  summaryGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      admin: {
        activity: {
          summary: { $get: mocks.summaryGet },
        },
      },
    },
  },
}));

import {
  AdminActivityAccessError,
  fetchAdminActivitySummary,
} from '../../src/lib/admin-activity-api';

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
