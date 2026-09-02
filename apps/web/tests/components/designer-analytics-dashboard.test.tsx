import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsResponse, ProfileCompletionResponse } from '@repo/contracts';
import { DesignerAnalyticsDashboard } from '../../src/components/designer-analytics-dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/analytics',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
    expect(screen.getAllByRole('table')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Conversions' })).toBeInTheDocument();
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
});
