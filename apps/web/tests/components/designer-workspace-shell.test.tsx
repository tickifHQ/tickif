import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DesignerWorkspaceShell } from '../../src/components/designer-workspace-shell';
import type { OrganizationCapabilities } from '@repo/contracts';

const RESTRICTED_CAPABILITIES: OrganizationCapabilities = {
  billing: false,
  manageMembers: false,
  changeMemberRoles: false,
  transferOwnership: false,
  writeProjects: false,
  submitProjects: false,
  archiveProjects: false,
  deleteProjects: false,
  leadScope: 'none',
  analyticsScope: 'billing',
  editOrganization: false,
  manageVerification: false,
};

const FULL_CAPABILITIES: OrganizationCapabilities = {
  billing: true,
  manageMembers: true,
  changeMemberRoles: true,
  transferOwnership: true,
  writeProjects: true,
  submitProjects: true,
  archiveProjects: true,
  deleteProjects: true,
  leadScope: 'full',
  analyticsScope: 'full',
  editOrganization: true,
  manageVerification: true,
};

const mock = vi.hoisted(() => ({
  pathname: '/designer/dashboard',
  router: { refresh: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mock.pathname,
  useRouter: () => mock.router,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: ({
    showLabel,
    showProfileSettings,
    avatarSeed,
  }: {
    showLabel?: boolean;
    showProfileSettings?: boolean;
    avatarSeed?: string;
  }) => (
    <div
      data-testid="account-menu"
      data-show-label={showLabel ? 'true' : 'false'}
      data-profile-settings={showProfileSettings ? 'true' : 'false'}
      data-avatar-seed={avatarSeed}
    />
  ),
}));

vi.mock('@/components/initials-avatar', () => ({
  InitialsAvatar: () => <div>Avatar</div>,
}));

vi.mock('@/components/designer-organization-switcher', () => ({
  DesignerOrganizationSwitcher: ({
    logoUrl,
    isWorkspaceRefreshing,
    onSwitchSuccess,
  }: {
    logoUrl?: string | null;
    isWorkspaceRefreshing?: boolean;
    onSwitchSuccess?: (organizationId: string) => void;
  }) => (
    <button
      type="button"
      data-testid="organization-switcher"
      data-logo-url={logoUrl ?? ''}
      data-refreshing={isWorkspaceRefreshing ? 'true' : 'false'}
      onClick={() => onSwitchSuccess?.('org-2')}
    >
      Organization switcher
    </button>
  ),
}));

vi.mock('@/components/designer-branch-selector', () => ({
  DesignerBranchSelector: ({ organizationId }: { organizationId: string | null }) => (
    <div data-testid="branch-selector" data-organization-id={organizationId}>
      Branch switcher
    </div>
  ),
}));

describe('DesignerWorkspaceShell', () => {
  it('passes the active portfolio logo to the organization switcher', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={RESTRICTED_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        logoUrl="https://storage.example.com/studio-one.webp"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getByTestId('organization-switcher')).toHaveAttribute(
      'data-logo-url',
      'https://storage.example.com/studio-one.webp',
    );
  });

  it('hides links and project creation when the active organization role lacks access', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={RESTRICTED_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Leads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Team & Roles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Branches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add new project' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Analytics' })).toBeInTheDocument();
    expect(screen.queryByText(/^Grow$/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('account-menu')).toHaveAttribute('data-profile-settings', 'false');
  });
  it('shows a workspace skeleton until the refreshed organization is rendered', async () => {
    mock.pathname = '/designer/dashboard';
    mock.router.refresh.mockReset();
    const user = userEvent.setup();
    const { rerender } = render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        planLabel="Hobby plan"
      >
        <div>Studio One dashboard</div>
      </DesignerWorkspaceShell>,
    );

    await user.click(screen.getByTestId('organization-switcher'));

    expect(mock.router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'Loading workspace' })).toBeInTheDocument();
    expect(screen.queryByText('Studio One dashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher')).toHaveAttribute('data-refreshing', 'true');

    rerender(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-2"
        studioName="Studio Two"
        planLabel="Corporate plan"
      >
        <div>Studio Two dashboard</div>
      </DesignerWorkspaceShell>,
    );

    expect(await screen.findByText('Studio Two dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading workspace' })).not.toBeInTheDocument();
    expect(screen.getByTestId('organization-switcher')).toHaveAttribute('data-refreshing', 'false');
  });

  it('renders the desktop sidebar without its own background or border', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const sidebar = screen.getByRole('complementary');

    expect(sidebar).not.toHaveClass('bg-background/70');
    expect(sidebar).not.toHaveClass('border-r');
  });

  it('shows the product icon beside Tickif with the standard ten-pixel gap and links to the designer dashboard', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    for (const brandLink of screen.getAllByRole('link', { name: 'Tickif' })) {
      expect(brandLink).toHaveClass('gap-2.5');
      expect(brandLink.querySelector('img')).toHaveAttribute('src', '/icon.svg');
      expect(brandLink).toHaveAttribute('href', '/designer/dashboard');
    }
  });

  it('links every implemented designer dashboard section from the sidebar', () => {
    mock.pathname = '/designer/analytics';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Studio One"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getByRole('link', { name: /consultations/i })).toHaveAttribute(
      'href',
      '/designer/consultations',
    );
    expect(screen.getAllByRole('link', { name: /^reviews$/i })[0]).toHaveAttribute(
      'href',
      '/designer/reviews',
    );
    expect(screen.getAllByRole('link', { name: /analytics/i })[0]).toHaveAttribute(
      'href',
      '/designer/analytics',
    );
    const leadsLink = screen.getAllByRole('link', { name: /^leads$/i })[0];
    expect(leadsLink).toHaveAttribute('href', '/designer/leads');
    expect(leadsLink?.querySelector('svg')).toHaveClass('lucide-file-user');
    expect(screen.getAllByRole('link', { name: /portfolio/i })[0]).toHaveAttribute(
      'href',
      '/designer/portfolio',
    );
    const teamAndRolesLink = screen.getAllByRole('link', { name: /team & roles/i })[0];
    expect(teamAndRolesLink).toHaveAttribute('href', '/designer/terms-roles');
    expect(teamAndRolesLink?.querySelector('svg')).toHaveClass('lucide-users-round');
    expect(screen.getAllByRole('link', { name: /plan & billing/i })[0]).toHaveAttribute(
      'href',
      '/designer/plan-billing',
    );
    expect(screen.queryByRole('link', { name: /profile & settings/i })).not.toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it.each([
    ['/designer/dashboard', 'Overview', 'lucide-layout-dashboard', 'lucide-house'],
    ['/designer/projects', 'Projects', 'lucide-layers', 'lucide-folder-kanban'],
    ['/designer/portfolio', 'Portfolio', 'lucide-link', 'lucide-link-2'],
    ['/designer/analytics', 'Analytics', 'lucide-chart-line', 'lucide-chart-column-big'],
    ['/designer/plan-billing', 'Plan & billing', 'lucide-credit-card', 'lucide-hand-coins'],
  ])(
    'uses the requested Lucide icon for %s in the sidebar and header',
    (pathname, label, iconClass, oldIconClass) => {
      mock.pathname = pathname;

      render(
        <DesignerWorkspaceShell
          capabilities={FULL_CAPABILITIES}
          activeOrganizationId="org-1"
          studioName="Antika Interiors"
          planLabel="Hobby plan"
        >
          <div>Dashboard content</div>
        </DesignerWorkspaceShell>,
      );

      const navLink = screen.getAllByRole('link', { name: label })[0];
      expect(navLink?.querySelector('svg')).toHaveClass(iconClass);
      expect(document.querySelector(`.${iconClass}`)).toBeInTheDocument();
      expect(document.querySelector(`.${oldIconClass}`)).not.toBeInTheDocument();
    },
  );

  it('uses the requested Lucide icon for Contact support', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const supportLink = screen.getByRole('link', { name: /contact support/i });
    expect(supportLink.querySelector('svg')).toHaveClass('lucide-message-square-more');
    expect(document.querySelector('.lucide-badge-help')).not.toBeInTheDocument();
    expect(supportLink).toHaveAttribute('href', 'https://wa.me/919994645911');
    expect(supportLink).toHaveAttribute('target', '_blank');
    expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('places the branch switcher above Contact support and keeps the organization switcher last', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const branchSwitcher = screen.getByTestId('branch-selector');
    const supportLink = screen.getByRole('link', { name: /contact support/i });
    const organizationSwitcher = screen.getByTestId('organization-switcher');

    expect(
      branchSwitcher.compareDocumentPosition(supportLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      supportLink.compareDocumentPosition(organizationSwitcher) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('keeps the profile header and enables settings in the header account menu', () => {
    mock.pathname = '/designer/profile';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.queryByRole('link', { name: /profile & settings/i })).not.toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(header).toHaveTextContent('Profile & settings');
    expect(header.querySelector('svg.lucide-settings')).toBeInTheDocument();
    expect(screen.getByTestId('account-menu')).toHaveAttribute('data-profile-settings', 'true');
  });

  it('keeps the header capsule avatar tied to the signed-in account, not the active studio', () => {
    mock.pathname = '/designer/portfolio';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Hehe Studio"
        planLabel="Hobby plan"
      >
        <div>Portfolio content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getByTestId('account-menu')).not.toHaveAttribute('data-avatar-seed');
  });

  it.each([
    '/designer/dashboard',
    '/designer/projects',
    '/designer/leads',
    '/designer/analytics',
    '/designer/verification',
  ])('keeps the same labelled account menu actions on %s', (pathname) => {
    mock.pathname = pathname;

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getByTestId('account-menu')).toHaveAttribute('data-show-label', 'true');
    expect(screen.getByTestId('account-menu')).toHaveAttribute('data-profile-settings', 'true');
  });

  it('routes Verification to the designer verification page', () => {
    mock.pathname = '/designer/verification';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const verificationLink = screen.getAllByRole('link', { name: /verification/i })[0];
    expect(verificationLink).toHaveAttribute('href', '/designer/verification');
    expect(verificationLink?.querySelector('svg')).toHaveClass('lucide-shield-check');
    expect(screen.getByRole('banner').querySelector('.lucide-shield')).toBeInTheDocument();
  });

  it('offers Explore Tickif to active designer workspaces without moving the header account menu', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const organizationSwitcher = screen.getByTestId('organization-switcher');
    const accountMenu = screen.getByTestId('account-menu');
    const addProject = screen.getByRole('link', { name: /add new project/i });

    const exploreLink = screen.getByRole('link', { name: /explore tickif/i });
    const supportLink = screen.getByRole('link', { name: /contact support/i });
    expect(exploreLink).toHaveAttribute('href', '/');
    expect(
      supportLink.compareDocumentPosition(exploreLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(exploreLink.querySelector('img')).toHaveAttribute('src', '/icon.svg');
    expect(exploreLink.querySelector('img')).toHaveClass('size-3.5');
    expect(exploreLink.querySelector('img')?.parentElement).toHaveClass('size-4');
    expect(exploreLink.lastElementChild).toHaveClass('lucide-external-link', 'ml-auto');
    expect(organizationSwitcher).toBeInTheDocument();
    expect(accountMenu.closest('header')).toContainElement(addProject);
    expect(
      addProject.compareDocumentPosition(accountMenu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('highlights nested routes without highlighting Overview for other designer pages', () => {
    mock.pathname = '/designer/projects/project-1/edit';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getAllByRole('link', { name: 'Projects' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('link', { name: 'Overview' })[0]).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('opens and closes the mobile navigation drawer', async () => {
    mock.pathname = '/designer/dashboard';
    const user = userEvent.setup();

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const navigation = screen.getByRole('dialog', { name: 'Designer navigation' });
    expect(navigation).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /profile & settings/i })).not.toBeInTheDocument();
    const mobileExplore = within(navigation).getByRole('link', { name: /explore tickif/i });
    const mobileSupport = within(navigation).getByRole('link', { name: /contact support/i });
    expect(mobileExplore).toHaveAttribute('href', '/');
    expect(
      mobileSupport.compareDocumentPosition(mobileExplore) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mobileExplore.querySelector('img')).toHaveAttribute('src', '/icon.svg');
    expect(mobileExplore.querySelector('img')).toHaveClass('size-3.5');
    expect(mobileExplore.querySelector('img')?.parentElement).toHaveClass('size-4');
    expect(mobileExplore.lastElementChild).toHaveClass('lucide-external-link');

    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('dialog', { name: 'Designer navigation' })).not.toBeInTheDocument();
  });

  it('keeps project upload scrolling inside the shell so the sidebar stays fixed', () => {
    mock.pathname = '/designer/projects/upload';

    render(
      <DesignerWorkspaceShell
        capabilities={FULL_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Upload content</div>
      </DesignerWorkspaceShell>,
    );

    const main = screen.getByText('Upload content').closest('main');
    const section = main?.closest('section');
    const shell = main?.closest('.fixed');
    const projectsLinks = screen.getAllByRole('link', { name: 'Projects' });

    for (const projectsLink of projectsLinks) {
      expect(projectsLink.querySelector('svg')).toHaveClass('lucide-layers');
      expect(projectsLink.querySelector('.lucide-sliders-horizontal')).not.toBeInTheDocument();
    }
    expect(shell).toHaveClass('inset-0');
    expect(shell).toHaveClass('overflow-hidden');
    expect(main).toHaveClass('h-full');
    expect(main).toHaveClass('overflow-y-auto');
    expect(section).toHaveClass('flex-1');
    expect(section).toHaveClass('overflow-hidden');
  });

  it('hides Plan & billing from non-owners in desktop and mobile nav', async () => {
    mock.pathname = '/designer/dashboard';
    const user = userEvent.setup();
    render(
      <DesignerWorkspaceShell
        capabilities={RESTRICTED_CAPABILITIES}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        planLabel="Hobby plan"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.queryByRole('link', { name: /plan & billing/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.queryByRole('link', { name: /plan & billing/i })).not.toBeInTheDocument();
  });
});
