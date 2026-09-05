import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireAuth: vi.fn(), queue: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie: 'session=admin' }) }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/admin-review-api', () => ({ fetchAdminReviews: mocks.queue }));
vi.mock('@/components/admin-review-queue', () => ({
  AdminReviewQueue: ({ status }: { status: string }) => <div>{status}</div>,
}));
import Page from '../../../../app/(admin)/review-moderation/page';

describe('review moderation page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.queue.mockResolvedValue({ items: [], page: 2, limit: 20, total: 0, totalPages: 0 });
  });
  it('checks admin access before loading private data and respects URL pagination', async () => {
    render(await Page({ searchParams: Promise.resolve({ status: 'disputed', page: '2' }) }));
    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(mocks.queue).toHaveBeenCalledWith(
      { status: 'disputed', page: 2, limit: 20 },
      'session=admin',
    );
    expect(screen.getByText('disputed')).toBeInTheDocument();
  });
  it('does not load review data if the role guard rejects the session', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('unauthorized'));
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('unauthorized');
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
