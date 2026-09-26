import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminEnquiries } from '../../src/lib/admin-enquiries-api';

const mocks = vi.hoisted(() => ({ enquiries: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { api: { admin: { activity: { enquiries: { $get: mocks.enquiries } } } } },
}));

const enquiry = {
  id: '11111111-1111-4111-8111-111111111111',
  requester: { id: 'visitor-1', name: 'Asha Rao', email: 'asha@example.com' },
  designer: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'North Star Studio',
  },
  organizationId: 'org-1',
  referredProject: null,
  subject: 'Living room renovation',
  budget: '₹10L–₹20L',
  timeline: null,
  status: 'open' as const,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-21T11:00:00.000Z',
};

const counts = { all: 30, open: 12, responded: 10, closed: 8 };

function response(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  };
}

describe('admin enquiries API adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the all-status view without inventing a status query', async () => {
    const result = { items: [enquiry], counts, page: 2, limit: 25, total: 30, totalPages: 2 };
    mocks.enquiries.mockResolvedValue(response(result));

    await expect(
      fetchAdminEnquiries({ page: 2, limit: 25 }, { headers: { cookie: 'session=valid' } }),
    ).resolves.toEqual(result);
    expect(mocks.enquiries).toHaveBeenCalledWith(
      { query: { page: '2', limit: '25' } },
      { headers: { cookie: 'session=valid' }, init: { cache: 'no-store' } },
    );
  });

  it.each(['open', 'responded', 'closed'] as const)(
    'forwards the %s filter through the typed route',
    async (status) => {
      mocks.enquiries.mockResolvedValue(
        response({ items: [], counts, page: 1, limit: 10, total: 0, totalPages: 0 }),
      );

      await fetchAdminEnquiries({ status, page: 1, limit: 10 });

      expect(mocks.enquiries).toHaveBeenCalledWith(
        { query: { page: '1', limit: '10', status } },
        { init: { cache: 'no-store' } },
      );
    },
  );

  it('preserves nullable project and timeline values from a valid response', async () => {
    const result = { items: [enquiry], counts, page: 1, limit: 25, total: 1, totalPages: 1 };
    mocks.enquiries.mockResolvedValue(response(result));
    await expect(fetchAdminEnquiries({ page: 1, limit: 25 })).resolves.toEqual(result);
  });

  it('rejects invalid success payloads and reports safe HTTP failures', async () => {
    mocks.enquiries.mockResolvedValue(response({ items: [] }));
    await expect(fetchAdminEnquiries({ page: 1, limit: 25 })).rejects.toThrow(
      'response was invalid',
    );

    mocks.enquiries.mockResolvedValue(response({}, { ok: false, status: 403 }));
    await expect(fetchAdminEnquiries({ page: 1, limit: 25 })).rejects.toMatchObject({
      message: 'Could not load platform enquiries.',
      status: 403,
    });
  });
});
