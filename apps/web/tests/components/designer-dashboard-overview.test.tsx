import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  heroCoverUrl: 'https://cdn.example.com/livspace-cover.jpg',
  publiclyVisible: true,
  verificationStatus: null,
};

describe('DesignerDashboardOverview', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('does not offer project creation or organization editing to a read-only teammate', () => {
    render(
      <DesignerDashboardOverview
        studioName="Read-only studio"
        studioLocation="Bengaluru"
        portfolioUrl="https://tickif.com/d/studio"
        dashboard={dashboard}
        canWriteProjects={false}
        canEditOrganization={false}
      />,
    );
    expect(screen.queryAllByRole('link', { name: /add (new|first) project/i })).toHaveLength(0);
    expect(screen.queryByRole('link', { name: /start verification/i })).not.toBeInTheDocument();
    expect(
      screen.queryAllByRole('link', {
        name: /manage portfolio|complete your portfolio|round out your profile/i,
      }),
    ).toHaveLength(0);
  });
  it('renders the welcome state, progress score, and onboarding checklist', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
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

  it('shows the saved portfolio logo in the sharing preview', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        logoUrl="https://storage.example.com/livspace.webp"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getByRole('img', { name: 'Livspace logo' })).toHaveAttribute(
      'src',
      'https://storage.example.com/livspace.webp',
    );
    expect(screen.getByTestId('dashboard-preview-logo')).toHaveClass('relative', 'z-10');
    expect(screen.getByTestId('dashboard-preview-logo')).not.toHaveClass('border');
    expect(
      screen.queryByRole('img', { name: 'Livspace generated profile initials' }),
    ).not.toBeInTheDocument();
  });

  it('keeps generated initials as the sharing preview fallback when no logo is saved', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        logoUrl={null}
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Livspace generated profile initials' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-preview-logo')).toHaveClass('relative', 'z-10');
    expect(screen.getByTestId('dashboard-preview-logo')).not.toHaveClass('border');
    expect(screen.queryByRole('img', { name: 'Livspace logo' })).not.toBeInTheDocument();
  });

  it('renders the saved portfolio cover in the dashboard share preview', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getByRole('img', { name: 'Livspace portfolio cover' })).toHaveAttribute(
      'src',
      expect.stringContaining('livspace-cover.jpg'),
    );
  });

  it('uses the existing gradient fallback when no portfolio cover is saved', () => {
    render(
      <DesignerDashboardOverview
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{ ...dashboard, heroCoverUrl: null }}
      />,
    );

    expect(screen.queryByRole('img', { name: 'Livspace portfolio cover' })).not.toBeInTheDocument();
  });

  it('links the shipped project, profile, and share actions', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        portfolioPubliclyVisible
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
      '/designer/portfolio',
    );
    const copyButton = screen.getByRole('button', { name: /copy link/i });

    expect(copyButton).toBeInTheDocument();
    expect(copyButton).toHaveClass(
      'bg-button-fancy',
      'text-button-fancy-foreground',
      'shadow-button-fancy',
    );
  });

  // E-278: the share card must not expose a public URL until the portfolio is live.
  it('exposes the canonical public link and copy action only when publicly visible', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        portfolioPubliclyVisible
        dashboard={dashboard}
      />,
    );

    expect(screen.getByText('tickif.com/d/livspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /complete your portfolio/i }),
    ).not.toBeInTheDocument();
  });

  it('hides the public URL and copy action, showing a readiness CTA, when not publicly visible', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        portfolioPubliclyVisible={false}
        dashboard={dashboard}
      />,
    );

    // No copyable/visible public URL.
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
    expect(screen.queryByText('tickif.com/d/livspace')).not.toBeInTheDocument();
    expect(screen.getByText(/not public yet/i)).toBeInTheDocument();
    // Clear CTA to finish the portfolio instead — the canonical Portfolio
    // Settings route that owns the hero fields (logo, name, tagline, bio).
    expect(screen.getByRole('link', { name: /complete your portfolio/i })).toHaveAttribute(
      'href',
      '/designer/portfolio',
    );
  });

  it('never surfaces a placeholder URL as a copyable link when not publicly visible', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/studio"
        portfolioPubliclyVisible={false}
        dashboard={{
          ...dashboard,
          shareUrl: 'https://tickif.com/d/studio',
          publiclyVisible: false,
        }}
      />,
    );

    expect(screen.queryByText('tickif.com/d/studio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
  });

  it('links incomplete profile and unstarted verification prompts to their workflows', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={dashboard}
      />,
    );

    expect(screen.getByRole('link', { name: /round out your profile/i })).toHaveAttribute(
      'href',
      '/designer/portfolio',
    );
    expect(screen.getByRole('link', { name: /start verification/i })).toHaveAttribute(
      'href',
      '/designer/verification',
    );
  });

  it('removes the profile prompt once profile completion is done', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{
          ...dashboard,
          profileCompletion: { score: 100, missing: [] },
        }}
      />,
    );

    expect(screen.queryByText(/round out your profile/i)).not.toBeInTheDocument();
  });

  it('removes the verification prompt once the organization is verified', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{ ...dashboard, verificationStatus: 'verified' }}
      />,
    );

    expect(screen.queryByText(/verification/i)).not.toBeInTheDocument();
  });

  it('hides the whole next-steps section once profile and verification are complete', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        workspaceKey="all-next-steps-complete"
        dashboard={{
          ...dashboard,
          profileCompletion: { score: 100, missing: [] },
          verificationStatus: 'verified',
        }}
      />,
    );

    expect(screen.queryByText(/what happens next/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/we review your project/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-next-steps')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-share-card')).toBeInTheDocument();
  });

  it('hides first-project setup after a project exists while retaining the illustration', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        workspaceKey="first-project-complete"
        dashboard={{
          ...dashboard,
          projects: { total: 1, published: 0, inReview: 1, draft: 0 },
        }}
      />,
    );

    expect(screen.queryByRole('link', { name: /add first project/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-complete-setup')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-workspace-illustration')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-share-card')).toBeInTheDocument();
  });

  it('keeps remaining next steps above the sharing card after the first project is done', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        workspaceKey="project-done-next-steps-open"
        dashboard={{
          ...dashboard,
          projects: { total: 1, published: 0, inReview: 1, draft: 0 },
        }}
      />,
    );

    const shareCard = screen.getByTestId('dashboard-share-card');
    const nextSteps = screen.getByTestId('dashboard-next-steps');

    expect(
      nextSteps.compareDocumentPosition(shareCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('animates newly completed sections once and records the completed state', async () => {
    const workspaceKey = 'completion-transition';
    window.sessionStorage.setItem(
      `tickif:dashboard-right-rail:v1:${workspaceKey}`,
      JSON.stringify({ projectDone: false, nextStepsDone: false }),
    );

    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        workspaceKey={workspaceKey}
        dashboard={{
          ...dashboard,
          profileCompletion: { score: 100, missing: [] },
          projects: { total: 1, published: 0, inReview: 1, draft: 0 },
          verificationStatus: 'verified',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-complete-setup')).toHaveAttribute(
        'data-state',
        'closed',
      );
      expect(screen.getByTestId('dashboard-next-steps')).toHaveAttribute('data-state', 'closed');
    });

    expect(window.sessionStorage.getItem(`tickif:dashboard-right-rail:v1:${workspaceKey}`)).toBe(
      JSON.stringify({ projectDone: true, nextStepsDone: true }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-complete-setup')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-next-steps')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('dashboard-share-card')).toBeInTheDocument();
  });

  it.each([
    ['pending', 'Verification in review', 'Track the review of your submitted documents.'],
    ['rejected', 'Update verification', 'Review the requested changes and resubmit.'],
    ['expired', 'Renew verification', 'Update your documents to restore verification.'],
  ] as const)('shows the correct %s verification follow-up', (status, title, description) => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
        studioName="Livspace"
        studioLocation="Chennai, Tamilnadu"
        portfolioUrl="https://tickif.com/d/livspace"
        dashboard={{ ...dashboard, verificationStatus: status }}
      />,
    );

    expect(screen.getByRole('link', { name: new RegExp(title, 'i') })).toHaveAttribute(
      'href',
      '/designer/verification',
    );
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it('uses the requested Lucide icons in the what happens next panel', () => {
    render(
      <DesignerDashboardOverview
        canWriteProjects
        canEditOrganization
        canManageVerification
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
        canWriteProjects
        canEditOrganization
        canManageVerification
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
        canWriteProjects
        canEditOrganization
        canManageVerification
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
        canWriteProjects
        canEditOrganization
        canManageVerification
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
        canWriteProjects
        canEditOrganization
        canManageVerification
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
