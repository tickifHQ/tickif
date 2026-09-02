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
  AdminVerificationQueue: ({ initialError }: { initialError?: string }) => (
    <div data-testid="admin-verification-queue">{initialError ?? 'loaded'}</div>
  ),
}));

describe('AdminVerificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireAuth.mockResolvedValue({ user: { role: 'admin' } });
    mock.headers.mockResolvedValue(new Headers({ cookie: 'session=valid' }));
    mock.fetchQueue.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('server-loads the protected admin verification queue', async () => {
    const { default: Page } = await import('../../../../app/(admin)/verifications/page');

    render(await Page());

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(mock.fetchQueue).toHaveBeenCalledWith(1, {
      headers: { cookie: 'session=valid' },
    });
    expect(screen.getByTestId('admin-verification-queue')).toHaveTextContent('loaded');
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
