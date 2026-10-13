import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  saved: vi.fn(),
  enquiries: vi.fn(),
  similar: vi.fn(),
  counts: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ cookie: 'session=synthetic' }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      'saved-projects': { $get: mock.saved },
      enquiries: { mine: { $get: mock.enquiries }, counts: { $get: mock.counts } },
      discovery: { similar: { ':id': { $get: mock.similar } } },
    },
  },
}));
import {
  getSavedProjectSuggestions,
  getVisitorHomeActivity,
  getVisitorEnquiryCounts,
} from '@/lib/visitor-home-data.server';

const project = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'test-home',
  title: 'Test home',
  studio: 'Test studio',
  city: null,
  locality: null,
  rating: 0,
  reviewCount: 0,
  budget: null,
  tags: [],
  coverImageId: null,
  coverImageUrl: null,
  imageWidth: null,
  imageHeight: null,
};
const saved = { projects: [project], page: 1, limit: 1, total: 4, totalPages: 4 };
const enquiries = { items: [], page: 1, limit: 1, total: 0, totalPages: 0 };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('visitor home API reads', () => {
  it('reads all-page unread counts privately without loading message bodies or media', async () => {
    mock.counts.mockResolvedValue(response({ total: 28, unread: 3 }));
    expect(await getVisitorEnquiryCounts()).toEqual({ total: 28, unread: 3 });
    expect(mock.counts).toHaveBeenCalledWith(
      {},
      {
        init: {
          headers: { cookie: 'session=synthetic' },
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        },
      },
    );
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mock.saved.mockResolvedValue(response(saved));
    mock.enquiries.mockResolvedValue(response(enquiries));
  });
  it('forwards the session, disables caching and uses actual totals', async () => {
    expect(await getVisitorHomeActivity()).toEqual({ saved, enquiries });
    const options = { init: { headers: { cookie: 'session=synthetic' }, cache: 'no-store' } };
    expect(mock.saved).toHaveBeenCalledWith({ query: { page: 1, limit: 1 } }, options);
    expect(mock.enquiries).toHaveBeenCalledWith(
      { query: { status: 'all', page: 1, limit: 1 } },
      options,
    );
  });
  it('keeps enquiries available when saves fail rather than displaying a false zero', async () => {
    mock.saved.mockResolvedValue(response({}, 503));
    expect(await getVisitorHomeActivity()).toEqual({ saved: null, enquiries });
  });
  it('keeps saved projects available when enquiries fail', async () => {
    mock.enquiries.mockRejectedValue(new Error('Network unavailable'));
    expect(await getVisitorHomeActivity()).toEqual({ saved, enquiries: null });
  });
  it('rejects malformed successes and handles complete failure', async () => {
    mock.saved.mockResolvedValue(response({ ...saved, total: 'not-a-number' }));
    mock.enquiries.mockResolvedValue(response({}, 401));
    expect(await getVisitorHomeActivity()).toEqual({ saved: null, enquiries: null });
  });
  it('uses the existing similarity endpoint and excludes source and duplicate projects', async () => {
    const other = { ...project, id: '22222222-2222-4222-8222-222222222222' };
    mock.similar.mockResolvedValue(response({ projects: [project, other, other] }));
    expect(await getSavedProjectSuggestions(project.id)).toEqual([other]);
    expect(mock.similar).toHaveBeenCalledWith(
      { param: { id: project.id } },
      { init: { cache: 'no-store' } },
    );
  });
  it('surfaces similarity failures to the retryable region', async () => {
    mock.similar.mockResolvedValue(response({}, 404));
    await expect(getSavedProjectSuggestions(project.id)).rejects.toThrow();
  });
});
