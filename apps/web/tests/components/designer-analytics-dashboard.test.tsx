import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsResponse, ProfileCompletionResponse } from '@repo/contracts';
import { DesignerAnalyticsDashboard } from '../../src/components/designer-analytics-dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/analytics',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const branchesPayload = {
  activeTeamId: null,
  branchUsage: 2,
  branchLimit: -1,
  branches: [
    {
      id: 'team-1',
      name: 'Andheri',
      profileId: '11111111-1111-4111-8111-111111111111',
      profileSlug: 'andheri-studio',
      profileStatus: 'active',
      projectCount: 1,
      memberCount: 1,
      averageRating: 0,
      reviewCount: 0,
      footprint: [],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      members: [],
    },
    {
      id: 'team-2',
      name: 'Bandra',
      profileId: '22222222-2222-4222-8222-222222222222',
      profileSlug: 'bandra-studio',
      profileStatus: 'active',
      projectCount: 0,
      memberCount: 0,
      averageRating: 0,
      reviewCount: 0,
      footprint: [],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      members: [],
    },
  ],
};

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      orgs: {
        branches: {
          $get: () =>
            Promise.resolve({ ok: true, json: async () => structuredClone(branchesPayload) }),
        },
      },
    },
  },
}));

class ChartResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe() {
    this.callback([{ contentRect: { width: 640, height: 208 } } as ResizeObserverEntry], this);
  }

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ChartResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const analytics: AnalyticsResponse = {
  dataset: 'engagement',
  window: {
    days: 7,
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-07T12:00:00.000Z',
  },
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
    total: 6,
    draft: 2,
    submitted: 1,
    inReview: 0,
    published: 2,
    rejected: 0,
    changesRequested: 1,
  },
  leads: { total: 4, new: 2, contacted: 1, closed: 1, spam: 0 },
  engagement: { projectViews: 12, profileViews: 5 },
  previousPeriod: {
    projectViews: 10,
    enquiries: 3,
    viewToEnquiryRate: 30,
    responseRate: 100 / 3,
  },
  activity: [
    { date: '2026-08-01', projectsCreated: 0, leadsReceived: 0, projectViews: 1, profileViews: 0 },
    { date: '2026-08-02', projectsCreated: 1, leadsReceived: 0, projectViews: 2, profileViews: 1 },
    { date: '2026-08-03', projectsCreated: 0, leadsReceived: 2, projectViews: 1, profileViews: 1 },
    { date: '2026-08-04', projectsCreated: 0, leadsReceived: 0, projectViews: 3, profileViews: 0 },
    { date: '2026-08-05', projectsCreated: 1, leadsReceived: 1, projectViews: 2, profileViews: 1 },
    { date: '2026-08-06', projectsCreated: 0, leadsReceived: 0, projectViews: 1, profileViews: 1 },
    { date: '2026-08-07', projectsCreated: 0, leadsReceived: 1, projectViews: 2, profileViews: 1 },
  ],
  topConvertingProjects: [
    {
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Warm apartment',
      citySlug: 'chennai',
      localitySlug: 'velachery',
      views: 12,
      enquiries: 4,
      conversions: 2,
    },
  ],
  acquisitionSources: [
    { source: 'enquiry', enquiries: 3, conversions: 2 },
    { source: 'consultation', enquiries: 1, conversions: 0 },
  ],
  deferredMetrics: [],
};

const profileCompletion: ProfileCompletionResponse = {
  score: 78,
  missing: ['Logo'],
  steps: [{ key: 'profile-completed', label: 'Complete profile', done: false }],
};

describe('DesignerAnalyticsDashboard', () => {
  it('renders the designed analytics dashboard with real supported metrics', () => {
    render(
      <DesignerAnalyticsDashboard analytics={analytics} profileCompletion={profileCompletion} />,
    );

    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect(
      screen.getAllByText('Project views', { exact: true })[0]?.closest('[data-slot="card"]'),
    ).toHaveTextContent('12');
    expect(screen.getByText('Enquiries received').closest('[data-slot="card"]')).toHaveTextContent(
      '4',
    );
    const viewToEnquiryCard = screen.getByText('Enquiry rate').closest('[data-slot="card"]');
    expect(viewToEnquiryCard).toHaveTextContent('33.3%');
    expect(viewToEnquiryCard?.querySelector('.lucide-arrow-right')).toBeInTheDocument();
    expect(screen.getByText('Response rate').closest('[data-slot="card"]')).toHaveTextContent(
      '50%',
    );
    const projectViewsCard = screen
      .getAllByText('Project views', { exact: true })[0]
      ?.closest('[data-slot="card"]');
    expect(projectViewsCard).toHaveTextContent('+20%');
    expect(projectViewsCard).toHaveTextContent('+2 compared to prior 7 days');
    expect(
      screen.getByRole('img', { name: /project views during the selected period/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /profile strength/i })).toBeInTheDocument();
    expect(screen.getByText('78/100')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /enquiry funnel/i })).toBeInTheDocument();
    expect(document.querySelector('.lucide-moon')).toBeInTheDocument();
    expect(document.querySelector('.lucide-lightbulb')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-shield')).toBeInTheDocument();
    expect(document.querySelector('.lucide-shield-check')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /engagement breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /how they found you/i })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(3);
    expect(screen.getAllByRole('columnheader', { name: 'Conversions' })).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Enquiry share' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Conversion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Warm apartment' })).toHaveAttribute(
      'href',
      '/projects/11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByText('Enquiry')).toBeInTheDocument();
    expect(screen.getByText('Consultation')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('shows a new trend when the prior period had no activity', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          previousPeriod: {
            projectViews: 0,
            enquiries: 0,
            viewToEnquiryRate: 0,
            responseRate: 0,
          },
        }}
        profileCompletion={profileCompletion}
      />,
    );

    const projectViewsCard = screen
      .getAllByText('Project views', { exact: true })[0]
      ?.closest('[data-slot="card"]');
    expect(projectViewsCard).toHaveTextContent('New');
    expect(projectViewsCard).toHaveTextContent('No activity in the prior 7 days');
  });

  it('renders an intentional empty state when the window has no activity', () => {
    render(
      <DesignerAnalyticsDashboard
        profileCompletion={profileCompletion}
        analytics={{
          ...analytics,
          projects: {
            ...analytics.projects,
            total: 0,
            published: 0,
            draft: 0,
            submitted: 0,
            changesRequested: 0,
          },
          leads: { total: 0, new: 0, contacted: 0, closed: 0, spam: 0 },
          engagement: { projectViews: 0, profileViews: 0 },
          activity: analytics.activity.map((point) => ({
            ...point,
            projectsCreated: 0,
            leadsReceived: 0,
            projectViews: 0,
          })),
          topConvertingProjects: [],
          acquisitionSources: [],
          previousPeriod: {
            projectViews: 0,
            enquiries: 0,
            viewToEnquiryRate: 0,
            responseRate: 0,
          },
        }}
      />,
    );

    expect(screen.getByText(/project views will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/project performance will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/acquisition sources will appear here/i)).toBeInTheDocument();
    expect(screen.getAllByText('No activity in either 7-day period')).toHaveLength(4);
  });

  it('shows a retryable error state instead of fabricated zero metrics', () => {
    render(<DesignerAnalyticsDashboard analytics={null} error="Refresh the page and try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load analytics');
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/designer/analytics',
    );
    expect(screen.queryByText('Total projects')).not.toBeInTheDocument();
  });

  it('renders the corporate branch breakdown with a roll-up picker', async () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          branches: [
            {
              branchId: 'team-1',
              name: 'Andheri',
              projects: 4,
              enquiries: 3,
              conversions: 1,
              projectViews: 8,
              profileViews: 2,
            },
          ],
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByRole('heading', { name: /branch breakdown/i })).toBeInTheDocument();
    expect(screen.getAllByText('Andheri').length).toBeGreaterThan(0);
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(3);
  });

  it('shows an upgrade path instead of an empty branch selector below Corporate', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: {
            ...analytics.access,
            tier: 'hobby',
            tierScope: 'basic',
            branchAccess: 'upgrade_required',
          },
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByText(/Branch-level analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Basic organization analytics remain available/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Corporate plans/i })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
    expect(screen.queryByRole('heading', { name: /branch breakdown/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
  });

  it('suspends branch views under lock reusing the restore language', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: {
            ...analytics.access,
            lifecycleState: 'locked',
            branchAccess: 'suspended',
          },
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByText('Suspended')).toBeInTheDocument();
    expect(screen.getByText('Still Available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reactivate to restore/i })).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
    expect(screen.queryByRole('heading', { name: /branch breakdown/i })).not.toBeInTheDocument();
  });

  it('explains frozen branches instead of dropping them silently', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          frozenBranches: [
            {
              branchId: 'team-9',
              name: 'Powai',
              frozenAt: '2026-08-20T00:00:00.000Z',
              freezeRank: 1,
            },
          ],
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByRole('heading', { name: /frozen branches/i })).toBeInTheDocument();
    expect(screen.getByText(/Powai.*restores on re-upgrade/i)).toBeInTheDocument();
  });

  it('scopes the member view to their own projects', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: {
            role: 'member',
            roleScope: 'own',
            tier: 'corporate',
            lifecycleState: 'active',
            tierScope: 'branch',
            level: 'organization',
            branchId: null,
            branchAccess: 'available',
            readOnly: false,
            engagementVisible: true,
          },
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByText(/Showing your projects only/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('renders the full analytics layout for an admin', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: {
            role: 'admin',
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
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByRole('heading', { name: /branch breakdown/i })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('hides the roll-up breakdown once a branch is selected', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: { ...analytics.access, level: 'branch', branchId: 'team-1' },
          branches: [],
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.queryByRole('heading', { name: /branch breakdown/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
  });

  it('marks the viewer layout read-only', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          ...analytics,
          access: {
            role: 'viewer',
            roleScope: 'organization',
            tier: 'corporate',
            lifecycleState: 'active',
            tierScope: 'branch',
            level: 'organization',
            branchId: null,
            branchAccess: 'available',
            readOnly: true,
            engagementVisible: true,
          },
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByText(/View-only org-level analytics/i)).toBeInTheDocument();
  });

  it('renders the billing admin revenue view without engagement metrics', () => {
    render(
      <DesignerAnalyticsDashboard
        analytics={{
          dataset: 'billing',
          window: analytics.window,
          frozenBranches: [],
          access: {
            role: 'billing_admin',
            roleScope: 'billing',
            tier: 'corporate',
            lifecycleState: 'active',
            tierScope: 'branch',
            level: 'organization',
            branchId: null,
            branchAccess: 'available',
            readOnly: false,
            engagementVisible: false,
          },
          billing: {
            currencies: [
              {
                currency: 'INR',
                capturedAmount: 500000,
                failedAmount: 0,
                transactionCount: 2,
                capturedTransactions: 2,
                failedTransactions: 0,
              },
            ],
            currentPeriodEnd: '2026-09-30T00:00:00.000Z',
          },
          branches: [],
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
        }}
        profileCompletion={profileCompletion}
      />,
    );

    expect(screen.getByRole('heading', { name: /Billing analytics/i })).toBeInTheDocument();
    expect(screen.getByText(/Revenue only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analytics period: last 7 days/i })).toBeInTheDocument();
    expect(screen.queryByText('Enquiries received')).not.toBeInTheDocument();
    expect(screen.queryByText('Top converting projects')).not.toBeInTheDocument();
  });
});
