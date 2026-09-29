import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  fetchProjects: vi.fn(),
  fetchVerifications: vi.fn(),
  fetchReviews: vi.fn(),
  fetchSummary: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/admin-moderation-api', () => ({
  fetchAdminModerationQueue: mocks.fetchProjects,
}));
vi.mock('@/lib/admin-verification-api', () => ({
  fetchAdminVerificationQueue: mocks.fetchVerifications,
}));
vi.mock('@/lib/admin-review-api', () => ({ fetchAdminReviews: mocks.fetchReviews }));
vi.mock('@/lib/admin-activity-api', () => ({
  AdminActivityAccessError: class AdminActivityAccessError extends Error {},
  fetchAdminActivitySummary: mocks.fetchSummary,
}));

import AdminDashboardPage from '../../../../app/(admin)/dashboard/page';

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({ get: () => 'session=valid' });
    mocks.fetchProjects.mockResolvedValue({ total: 3 });
    mocks.fetchVerifications
      .mockResolvedValueOnce({ total: 4 })
      .mockResolvedValueOnce({ total: 2 });
    mocks.fetchReviews.mockResolvedValueOnce({ total: 5 }).mockResolvedValueOnce({ total: 1 });
    mocks.fetchSummary.mockResolvedValue({
      users: 120,
      activeUsers: 94,
      enquiries: 31,
      openEnquiries: 8,
      projectViews: 456,
      profileViews: 222,
      searches: 88,
    });
  });

  it('shows live queue cards and links to every review workflow', async () => {
    const { container } = render(await AdminDashboardPage());

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /platform summary/i })).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Active accounts')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Admin review queues' })).toBeInTheDocument();
    expect(screen.getByText('Project moderation')).toBeInTheDocument();
    expect(screen.getByText('Profile verification')).toBeInTheDocument();
    expect(screen.getByText('Review moderation')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /open queue/i })).toHaveLength(3);
    expect(screen.getByRole('link', { name: /new 4/i })).toHaveAttribute('href', '/verifications');
    expect(screen.getByRole('link', { name: /re-review 2/i })).toHaveAttribute(
      'href',
      '/verifications?tab=re_review',
    );
    expect(screen.getByRole('region', { name: 'Queue workload' })).toBeInTheDocument();
    expect(screen.getByText('15 active items')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(container.querySelector('.lucide-square-chart-gantt')).toBeInTheDocument();
    expect(container.querySelector('.lucide-shield-user')).toBeInTheDocument();
    expect(mocks.fetchProjects).toHaveBeenCalledWith('submitted', 1, {
      headers: { cookie: 'session=valid' },
    });
    expect(mocks.fetchSummary).toHaveBeenCalledWith('session=valid');
  });

  it('keeps real platform totals visible when queue totals cannot load', async () => {
    mocks.fetchProjects.mockRejectedValueOnce(new Error('offline'));

    render(await AdminDashboardPage());

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the current queue totals');
    expect(screen.queryByRole('region', { name: 'Admin review queues' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /platform summary/i })).toBeInTheDocument();
  });

  it('keeps review queues visible and offers retry when summary totals cannot load', async () => {
    mocks.fetchSummary.mockRejectedValueOnce(new Error('offline'));

    render(await AdminDashboardPage());

    expect(screen.getByRole('alert')).toHaveTextContent('Platform summary unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Admin review queues' })).toBeInTheDocument();
    expect(screen.queryByText('Total accounts')).not.toBeInTheDocument();
  });

  it('does not request or fabricate dashboard data without an admin session cookie', async () => {
    mocks.headers.mockResolvedValueOnce({ get: () => null });

    render(await AdminDashboardPage());

    expect(screen.getByRole('alert')).toHaveTextContent('admin session could not be found');
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
    expect(mocks.fetchProjects).not.toHaveBeenCalled();
  });
});
