import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  fetchQueue: vi.fn(),
  headers: vi.fn(),
  requireAuth: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mock.redirect }));
vi.mock('next/headers', () => ({ headers: mock.headers }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mock.requireAuth }));
vi.mock('@/lib/admin-moderation-api', () => ({
  ADMIN_MODERATION_QUEUE_TABS: ['submitted', 'in_review', 'published'],
  fetchAdminModerationQueue: mock.fetchQueue,
}));
vi.mock('@/components/admin-moderation-queue', () => ({
  AdminModerationQueue: ({ initialCounts }: { initialCounts?: Record<string, number> }) => (
    <div data-testid="admin-moderation-queue">{JSON.stringify(initialCounts)}</div>
  ),
}));

describe('AdminModerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } });
    mock.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mock.fetchQueue.mockImplementation(async (status: string) => ({
      items: [],
      page: 1,
      limit: 20,
      total: { submitted: 6, in_review: 2, published: 11 }[status] ?? 0,
      totalPages: 0,
    }));
  });

  it('server-loads the count for every moderation tab', async () => {
    const { default: Page } = await import('../../../../app/(admin)/moderation/page');

    render(await Page());

    expect(mock.fetchQueue).toHaveBeenCalledTimes(3);
    for (const status of ['submitted', 'in_review', 'published']) {
      expect(mock.fetchQueue).toHaveBeenCalledWith(status, 1, {
        headers: { cookie: 'session=valid' },
      });
    }
    expect(screen.getByTestId('admin-moderation-queue')).toHaveTextContent(
      '{"submitted":6,"in_review":2,"published":11}',
    );
  });

  it('loads the requested URL tab and page', async () => {
    const { default: Page } = await import('../../../../app/(admin)/moderation/page');
    await Page({ searchParams: Promise.resolve({ status: 'published', page: '2' }) });
    expect(mock.fetchQueue).toHaveBeenCalledWith('published', 2, {
      headers: { cookie: 'session=valid' },
    });
  });

  it('normalizes invalid query input and redirects a page beyond the current queue', async () => {
    const { default: Page } = await import('../../../../app/(admin)/moderation/page');
    await Page({ searchParams: Promise.resolve({ status: 'unknown', page: '-1' }) });
    expect(mock.fetchQueue).toHaveBeenCalledWith('submitted', 1, {
      headers: { cookie: 'session=valid' },
    });
    await Page({ searchParams: Promise.resolve({ status: 'in_review', page: '9' }) });
    expect(mock.redirect).toHaveBeenCalledWith('/moderation?status=in_review&page=1');
  });

  it('preserves a valid tab when normalizing an invalid page', async () => {
    const { default: Page } = await import('../../../../app/(admin)/moderation/page');
    await Page({ searchParams: Promise.resolve({ status: 'published', page: '-1' }) });

    expect(mock.redirect).toHaveBeenCalledWith('/moderation?status=published&page=1');
  });
});
