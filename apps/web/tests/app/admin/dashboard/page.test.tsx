import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  fetchProjects: vi.fn(),
  fetchVerifications: vi.fn(),
  fetchReviews: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('@/lib/admin-moderation-api', () => ({
  fetchAdminModerationQueue: mocks.fetchProjects,
}));
vi.mock('@/lib/admin-verification-api', () => ({
  fetchAdminVerificationQueue: mocks.fetchVerifications,
}));
vi.mock('@/lib/admin-review-api', () => ({ fetchAdminReviews: mocks.fetchReviews }));

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
  });

  it('shows live queue cards and links to every review workflow', async () => {
    const { container } = render(await AdminDashboardPage());

    expect(screen.getByRole('heading', { name: /admin dashboard/i })).toBeInTheDocument();
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
    expect(container.querySelector('.lucide-user-shield')).toBeInTheDocument();
    expect(mocks.fetchProjects).toHaveBeenCalledWith('submitted', 1, {
      headers: { cookie: 'session=valid' },
    });
  });

  it('fails closed with a useful message when queue totals cannot load', async () => {
    mocks.fetchProjects.mockRejectedValueOnce(new Error('offline'));

    render(await AdminDashboardPage());

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the current queue totals');
    expect(screen.queryByRole('region', { name: 'Admin review queues' })).not.toBeInTheDocument();
  });
});
