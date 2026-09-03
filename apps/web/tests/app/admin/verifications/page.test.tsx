import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  fetchQueue: vi.fn(),
  headers: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mock.headers }));
vi.mock('@/lib/auth-guard', () => ({ requireAuth: mock.requireAuth }));
vi.mock('@/lib/admin-verification-api', () => ({
  fetchAdminVerificationQueue: mock.fetchQueue,
}));
vi.mock('@/components/admin-verification-queue', () => ({
  AdminVerificationQueue: ({
    initialCounts,
    initialError,
  }: {
    initialCounts?: Record<string, number>;
    initialError?: string;
  }) => (
    <div data-testid="admin-verification-queue">
      {initialError ?? 'loaded'} {JSON.stringify(initialCounts)}
    </div>
  ),
}));

describe('AdminVerificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireAuth.mockResolvedValue({ user: { role: 'admin' } });
    mock.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mock.fetchQueue.mockImplementation(async (tab: string) => ({
      items: [],
      page: 1,
      limit: 20,
      total: { new: 2, re_review: 3, accepted: 4, changes_requested: 5 }[tab] ?? 0,
      totalPages: 0,
      tab,
    }));
  });

  it('server-loads the protected admin verification queue', async () => {
    const { default: Page } = await import('../../../../app/(admin)/verifications/page');

    render(await Page());

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(mock.fetchQueue).toHaveBeenCalledTimes(4);
    for (const tab of ['new', 're_review', 'accepted', 'changes_requested']) {
      expect(mock.fetchQueue).toHaveBeenCalledWith(tab, 1, {
        headers: { cookie: 'session=valid' },
      });
    }
    expect(screen.getByTestId('admin-verification-queue')).toHaveTextContent(
      'loaded {"new":2,"re_review":3,"accepted":4,"changes_requested":5}',
    );
  });

  it('shows a safe retryable error without exposing infrastructure details', async () => {
    mock.fetchQueue.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:8008'));
    const { default: Page } = await import('../../../../app/(admin)/verifications/page');

    render(await Page());

    expect(screen.getByTestId('admin-verification-queue')).toHaveTextContent(
      'Could not load submitted verifications. Try refreshing the page.',
    );
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});
