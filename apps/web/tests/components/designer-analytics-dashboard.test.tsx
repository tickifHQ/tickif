import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnalyticsResponse } from '@repo/contracts';
import { DesignerAnalyticsDashboard } from '../../src/components/designer-analytics-dashboard';

const analytics: AnalyticsResponse = {
  window: {
    days: 7,
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-07T12:00:00.000Z',
  },
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
  activity: [
    { date: '2026-08-01', projectsCreated: 0, leadsReceived: 0 },
    { date: '2026-08-02', projectsCreated: 1, leadsReceived: 0 },
    { date: '2026-08-03', projectsCreated: 0, leadsReceived: 2 },
    { date: '2026-08-04', projectsCreated: 0, leadsReceived: 0 },
    { date: '2026-08-05', projectsCreated: 1, leadsReceived: 1 },
    { date: '2026-08-06', projectsCreated: 0, leadsReceived: 0 },
    { date: '2026-08-07', projectsCreated: 0, leadsReceived: 1 },
  ],
  deferredMetrics: [
    {
      key: 'profileViews',
      label: 'Profile views',
      reason: 'Requires the Phase 3 interaction event pipeline.',
    },
    {
      key: 'projectViews',
      label: 'Project views',
      reason: 'Requires the Phase 3 interaction event pipeline.',
    },
  ],
};

describe('DesignerAnalyticsDashboard', () => {
  it('renders real metrics, activity, status breakdowns, and deferred view metrics', () => {
    render(<DesignerAnalyticsDashboard analytics={analytics} />);

    expect(
      screen.getByRole('heading', { name: /understand portfolio performance/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total projects').parentElement).toHaveTextContent('6');
    expect(screen.getByText('Published projects').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Total leads').parentElement).toHaveTextContent('4');
    expect(screen.getByText('New leads').parentElement).toHaveTextContent('2');
    expect(
      screen.getByRole('img', { name: /daily projects created and leads received/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /project status/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /lead funnel/i })).toBeInTheDocument();
    expect(screen.getByText('Profile views')).toBeInTheDocument();
    expect(screen.getByText('Project views')).toBeInTheDocument();
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });

  it('renders an intentional empty state when the window has no activity', () => {
    render(
      <DesignerAnalyticsDashboard
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
          activity: analytics.activity.map((point) => ({
            ...point,
            projectsCreated: 0,
            leadsReceived: 0,
          })),
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /no activity in this window/i }),
    ).toBeInTheDocument();
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
