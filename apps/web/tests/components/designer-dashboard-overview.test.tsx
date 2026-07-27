import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileDashboardResponse } from '@repo/contracts';
import { DesignerDashboardOverview } from '../../src/components/designer-dashboard-overview';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const dashboard: ProfileDashboardResponse = {
  profileCompletion: {
    score: 20,
    missing: ['bio', 'logo', 'location', 'scope', 'contact'],
  },
  projects: {
    total: 0,
    published: 0,
    inReview: 0,
    draft: 0,
  },
  leads: {
    total: 0,
    new: 0,
  },
  shareUrl: 'https://tickif.com/d/livspace',
};

describe('DesignerDashboardOverview', () => {
  it('renders the welcome state, progress score, and onboarding checklist', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getByRole('heading', { name: /welcome, livspace/i })).toBeInTheDocument();
    expect(screen.getByText(/let's get your profile ready to go live/i)).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText(/account creation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/upload your first project/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/complete profile/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/complete kyc/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/share the portfolio link in socials/i)).not.toBeInTheDocument();
  });

  it('links the shipped project, profile, and share actions', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getAllByRole('link', { name: /add new project/i })).toHaveLength(1);
    expect(
      screen
        .getAllByRole('link', { name: /add new project/i })
        .every((link) => link.getAttribute('href') === '/designer/projects/new'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /add first project/i })).toHaveAttribute(
      'href',
      '/designer/projects/new',
    );
    expect(screen.getByRole('link', { name: /manage portfolio/i })).toHaveAttribute(
      'href',
      '/designer/profile',
    );
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('keeps verification non-interactive until that flow ships', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getByText(/start verification/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /start verification/i })).not.toBeInTheDocument();
  });

  it('uses the requested Lucide icons in the what happens next panel', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(document.querySelector('.lucide-calendar-days')).toBeInTheDocument();
    expect(document.querySelector('.lucide-user')).toBeInTheDocument();
    expect(document.querySelector('.lucide-shield')).toBeInTheDocument();
    expect(document.querySelector('.lucide-clipboard-check')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-user-round-check')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-shield-check')).not.toBeInTheDocument();
  });

  it('shows setup complete once all tracked backend steps are done', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{
          ...dashboard,
          profileCompletion: {
            score: 100,
            missing: [],
          },
          projects: {
            total: 1,
            published: 0,
            inReview: 0,
            draft: 1,
          },
        }}
      />,
    );

    expect(screen.getByText(/setup complete/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/profile setup steps/i)).not.toBeInTheDocument();
  });

  it('uses API-provided completion steps when available', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
        completion={{
          score: 20,
          missing: ['bio'],
          steps: [
            { key: 'signed-in-with-google', label: 'Sign in with Google', done: true },
            { key: 'org-created', label: 'Create your organization', done: true },
            { key: 'profile-completed', label: 'Complete your profile', done: false },
            { key: 'first-project-uploaded', label: 'Upload your first project', done: false },
          ],
        }}
      />,
    );

    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    expect(screen.getByText(/create your organization/i)).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /add new project/i }).at(0)).toHaveAttribute(
      'href',
      '/designer/projects/new',
    );
  });

  it('shows checklist progress instead of backend field score on the setup card', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{
          ...dashboard,
          profileCompletion: {
            score: 33,
            missing: ['bio', 'logo', 'scope', 'contact'],
          },
          projects: {
            total: 1,
            published: 0,
            inReview: 0,
            draft: 1,
          },
        }}
        completion={{
          score: 33,
          missing: ['bio', 'logo', 'scope', 'contact'],
          steps: [
            { key: 'signed-in-with-google', label: 'Sign in with Google', done: true },
            { key: 'org-created', label: 'Create your organization', done: true },
            { key: 'profile-completed', label: 'Complete your profile', done: false },
            { key: 'first-project-uploaded', label: 'Upload your first project', done: true },
          ],
        }}
      />,
    );

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('33%')).not.toBeInTheDocument();
  });

  it('surfaces completion loading failures without replacing them with a fake empty state', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
        dashboardError="Could not load dashboard summary."
      />,
    );

    expect(screen.getByText(/could not load dashboard summary/i)).toBeInTheDocument();
  });
});
