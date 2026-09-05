import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(() => ({ get: () => 'session=abc' })),
  analyticsGet: vi.fn(),
  getProfileCompletion: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('@/lib/api', () => ({
  api: { api: { reports: { analytics: { $get: mocks.analyticsGet } } } },
}));

vi.mock('@/lib/designer-profile', () => ({
  getProfileCompletion: mocks.getProfileCompletion,
}));

vi.mock('@/components/designer-analytics-dashboard', () => ({
  DesignerAnalyticsDashboard: ({ analytics, error }: { analytics: unknown; error?: string }) => (
    <div>
      <div data-testid="analytics">{analytics ? 'loaded' : 'empty'}</div>
      <div data-testid="error">{error ?? ''}</div>
    </div>
  ),
}));

import DesignerAnalyticsPage from '../../../../app/(designer)/designer/analytics/page';

describe('DesignerAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.analyticsGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        dataset: 'engagement',
        window: { days: 30, from: '2026-08-01T00:00:00.000Z', to: '2026-08-30T00:00:00.000Z' },
        access: {
          role: 'owner',
          roleScope: 'full',
          tier: 'corporate',
          lifecycleState: 'active',
          tierScope: 'branch',
          level: 'organization',
          branchId: null,
          branchAccess: 'available',
          readOnly: false,
          engagementVisible: true,
        },
        billing: null,
        branches: [],
        frozenBranches: [],
        projects: {
          total: 0,
          draft: 0,
          submitted: 0,
          inReview: 0,
          published: 0,
          rejected: 0,
          changesRequested: 0,
        },
        leads: { total: 0, new: 0, contacted: 0, closed: 0, spam: 0 },
        engagement: { projectViews: 0, profileViews: 0 },
        previousPeriod: { projectViews: 0, enquiries: 0, viewToEnquiryRate: 0, responseRate: 0 },
        activity: [],
        topConvertingProjects: [],
        acquisitionSources: [],
        deferredMetrics: [],
      }),
    });
    mocks.getProfileCompletion.mockResolvedValue({ data: null });
  });

  it('passes days, branch, and dataset filters through to the API', async () => {
    render(
      await DesignerAnalyticsPage({
        searchParams: Promise.resolve({ days: '7', branchId: 'team-1' }),
      }),
    );

    expect(mocks.analyticsGet).toHaveBeenCalledWith(
      { query: { days: 7, branchId: 'team-1', dataset: undefined } },
      { headers: { cookie: 'session=abc' } },
    );
    expect(screen.getByTestId('analytics')).toHaveTextContent('loaded');
  });

  it('explains Corporate-gated branch views distinctly from role denials', async () => {
    mocks.analyticsGet.mockResolvedValue({ ok: false, status: 402 });
    render(await DesignerAnalyticsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId('error')).toHaveTextContent('need Corporate');

    mocks.analyticsGet.mockResolvedValue({ ok: false, status: 403 });
    render(await DesignerAnalyticsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getAllByTestId('error')[1]).toHaveTextContent('role does not allow');
  });
});
