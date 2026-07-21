import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DesignerWorkspaceShell } from '../../src/components/designer-workspace-shell';

const mock = vi.hoisted(() => ({
  pathname: '/designer/dashboard',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mock.pathname,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: () => <div data-testid="account-menu" />,
}));

vi.mock('@/components/initials-avatar', () => ({
  InitialsAvatar: () => <div>Avatar</div>,
}));

vi.mock('@/components/designer-organization-switcher', () => ({
  DesignerOrganizationSwitcher: () => <div data-testid="organization-switcher" />,
}));

describe('DesignerWorkspaceShell', () => {
  it('links every implemented designer dashboard section from the sidebar', () => {
    mock.pathname = '/designer/analytics';

    render(
      <DesignerWorkspaceShell
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
    expect(screen.getAllByRole('link', { name: /portfolio/i })[0]).toHaveAttribute(
      'href',
      '/designer/portfolio',
    );
    expect(screen.getAllByRole('link', { name: /terms & roles/i })[0]).toHaveAttribute(
      'href',
      '/designer/terms-roles',
    );
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

  it('routes Profile & settings to the designer profile page', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
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

  it('keeps the unimplemented Verification item non-interactive', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
        activeOrganizationId="org-1"
        studioName="Antika Interiors"
        studioLocation="Chennai"
      >
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    const item = screen.getAllByText('Verification')[0]?.closest('[aria-disabled="true"]');
    expect(item).toBeInTheDocument();
    expect(item?.closest('a')).toBeNull();
  });

  it('places the organization switcher below Explore Tickif without moving the header account menu', () => {
    mock.pathname = '/designer/dashboard';

    render(
      <DesignerWorkspaceShell
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

    expect(shell).toHaveClass('inset-0');
    expect(shell).toHaveClass('overflow-hidden');
    expect(main).toHaveClass('h-full');
    expect(main).toHaveClass('overflow-y-auto');
    expect(section).toHaveClass('flex-1');
    expect(section).toHaveClass('overflow-hidden');
  });
});
