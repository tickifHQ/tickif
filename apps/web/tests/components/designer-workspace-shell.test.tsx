import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DesignerWorkspaceShell } from '../../src/components/designer-workspace-shell';

const mock = vi.hoisted(() => ({
  pathname: '/designer/dashboard',
  router: { refresh: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mock.pathname,
  useRouter: () => mock.router,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: () => <div data-testid="account-menu" />,
}));

vi.mock('@/components/initials-avatar', () => ({
  InitialsAvatar: () => <div>Avatar</div>,
}));

vi.mock('@/components/designer-organization-switcher', () => ({
  DesignerOrganizationSwitcher: ({
    isWorkspaceRefreshing,
    onSwitchSuccess,
  }: {
    isWorkspaceRefreshing?: boolean;
    onSwitchSuccess?: (organizationId: string) => void;
  }) => (
    <button
      type="button"
      data-testid="organization-switcher"
      data-refreshing={isWorkspaceRefreshing ? 'true' : 'false'}
      onClick={() => onSwitchSuccess?.('org-2')}
    >
      Organization switcher
    </button>
  ),
}));

describe('DesignerWorkspaceShell', () => {
  it('shows a workspace skeleton until the refreshed organization is rendered', async () => {
    mock.pathname = '/designer/dashboard';
    mock.router.refresh.mockReset();
    const user = userEvent.setup();
    const { rerender } = render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
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
        isOwner
        activeOrganizationId="org-2"
        studioName="Studio Two"
        studioLocation="Pune"
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
        isOwner
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const sidebar = screen.getByRole('complementary');

    expect(sidebar).not.toHaveClass('bg-background/70');
    expect(sidebar).not.toHaveClass('border-r');
  });

  it('shows the product icon beside Tickif with the standard ten-pixel gap', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    for (const brandLink of screen.getAllByRole('link', { name: 'Tickif' })) {
      expect(brandLink).toHaveClass('gap-2.5');
      expect(brandLink.querySelector('img')).toHaveAttribute('src', '/icon.svg');
    }
  });

  it('links every implemented designer dashboard section from the sidebar', () => {
    mock.pathname = '/designer/analytics';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Studio One"
        studioLocation="Mumbai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getAllByRole('link', { name: /consultations/i })[0]).toHaveAttribute(
      'href',
      '/designer/consultations',
    );
    expect(screen.getAllByRole('link', { name: /reviews/i })[0]).toHaveAttribute(
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
    expect(screen.getAllByRole('link', { name: /profile & settings/i })[0]).toHaveAttribute(
      'href',
      '/designer/profile',
    );
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
  });

  it.each([
    ['/designer/dashboard', 'Overview', 'lucide-layout-dashboard', 'lucide-house'],
    ['/designer/projects', 'Projects', 'lucide-layers', 'lucide-folder-kanban'],
    ['/designer/portfolio', 'Portfolio', 'lucide-link', 'lucide-link-2'],
    ['/designer/analytics', 'Analytics', 'lucide-chart-line', 'lucide-chart-column-big'],
    ['/designer/plan-billing', 'Plan & billing', 'lucide-credit-card', 'lucide-hand-coins'],
    ['/designer/profile', 'Profile & settings', 'lucide-settings', 'lucide-circle-user-round'],
  ])(
    'uses the requested Lucide icon for %s in the sidebar and header',
    (pathname, label, iconClass, oldIconClass) => {
      mock.pathname = pathname;

      render(
        <DesignerWorkspaceShell
          isOwner
          activeOrganizationId="org-1"
          studioName="Antika Interiors"
          studioLocation="Chennai"
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
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const supportLink = screen.getByRole('link', { name: /contact support/i });
    expect(supportLink.querySelector('svg')).toHaveClass('lucide-message-square-more');
    expect(document.querySelector('.lucide-badge-help')).not.toBeInTheDocument();
  });

  it('routes Profile & settings to the designer profile page', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getAllByRole('link', { name: /profile & settings/i })[0]).toHaveAttribute(
      'href',
      '/designer/profile',
    );
  });

  it('routes Verification to the designer verification page', () => {
    mock.pathname = '/designer/verification';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const verificationLink = screen.getAllByRole('link', { name: /verification/i })[0];
    expect(verificationLink).toHaveAttribute('href', '/designer/verification');
    expect(verificationLink?.querySelector('svg')).toHaveClass('lucide-shield-check');
    expect(screen.getByRole('banner').querySelector('.lucide-shield')).toBeInTheDocument();
  });

  it('places the organization switcher below Explore Tickif without moving the header account menu', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const exploreTickif = screen.getByRole('link', { name: /explore tickif/i });
    const organizationSwitcher = screen.getByTestId('organization-switcher');
    const accountMenu = screen.getByTestId('account-menu');
    const addProject = screen.getByRole('link', { name: /add new project/i });

    expect(exploreTickif.querySelector('img')).toHaveAttribute('src', '/icon.svg');
    expect(exploreTickif.querySelector('.lucide-external-link')).toBeInTheDocument();
    expect(exploreTickif.querySelector('.lucide-arrow-up-right')).not.toBeInTheDocument();
    expect(
      exploreTickif.compareDocumentPosition(organizationSwitcher) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(accountMenu.closest('header')).toContainElement(addProject);
    expect(
      addProject.compareDocumentPosition(accountMenu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('highlights nested routes without highlighting Overview for other designer pages', () => {
    mock.pathname = '/designer/projects/project-1/edit';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
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
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Designer navigation' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close navigation' }));
    expect(screen.queryByRole('dialog', { name: 'Designer navigation' })).not.toBeInTheDocument();
  });

  it('keeps project upload scrolling inside the shell so the sidebar stays fixed', () => {
    mock.pathname = '/designer/projects/upload';

    render(
      <DesignerWorkspaceShell
        isOwner
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
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
        isOwner={false}
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.queryByRole('link', { name: /plan & billing/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.queryByRole('link', { name: /plan & billing/i })).not.toBeInTheDocument();
  });
});
