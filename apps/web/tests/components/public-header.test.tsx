import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PublicHeader } from '../../src/components/public-header';

let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: ({ showProfileSettings }: { showProfileSettings?: boolean }) => (
    <div data-profile-settings={String(showProfileSettings ?? false)}>Account menu</div>
  ),
}));

describe('PublicHeader', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it('does not render current or unavailable navigation items as links', () => {
    render(<PublicHeader />);

    const nav = screen.getByRole('navigation', { name: 'Primary' });

    expect(within(nav).getByText('Explore').closest('a')).toBeNull();
    expect(within(nav).getByText('Explore')).toHaveAttribute('aria-current', 'page');

    expect(within(nav).getByRole('link', { name: 'Designers' })).toHaveAttribute(
      'href',
      '/designers',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Mobile primary' })).getByRole('link', {
        name: 'Designers',
      }),
    ).toHaveAttribute('href', '/designers');

    for (const label of ['Cost Calculator', 'For you']) {
      expect(within(nav).queryByText(label)).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('navigation', { name: 'Mobile primary' })).queryByText(label),
      ).not.toBeInTheDocument();
    }

    expect(within(nav).getByRole('link', { name: 'Your Enquiries' })).toHaveAttribute(
      'href',
      '/enquiries',
    );
  });

  it('links back to Explore without linking to the current enquiries page', () => {
    pathname = '/enquiries';
    render(<PublicHeader />);

    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
        name: 'Explore',
      }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByText('Your Enquiries').closest('a')).toBeNull();
    expect(screen.getByText('Your Enquiries')).toHaveAttribute('aria-current', 'page');
  });

  it('marks the current directory in both desktop and mobile navigation', () => {
    pathname = '/designers';
    render(<PublicHeader />);

    for (const name of ['Primary', 'Mobile primary']) {
      const item = within(screen.getByRole('navigation', { name })).getByText('Designers');
      expect(item).toHaveAttribute('aria-current', 'page');
      expect(item.closest('a')).toBeNull();
    }
  });

  it('treats nested enquiry routes as the current Your Enquiries item', () => {
    pathname = '/enquiries/abc';
    render(<PublicHeader />);

    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
        name: 'Explore',
      }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByText('Your Enquiries').closest('a')).toBeNull();
    expect(screen.getByText('Your Enquiries')).toHaveAttribute('aria-current', 'page');
  });

  it('sends signed-out users to the designer login mode', () => {
    render(<PublicHeader />);

    const listYourWorkLink = screen.getByRole('link', { name: /list your work/i });
    const signInLink = screen.getByRole('link', { name: /sign in/i });

    expect(listYourWorkLink).toHaveAttribute('href', '/login?mode=designer');
    expect(listYourWorkLink).toHaveClass('h-8');
    expect(signInLink).toHaveClass('h-8', 'bg-button-inverted', 'text-button-inverted-foreground');
    expect(listYourWorkLink.querySelector('.lucide-list-chevrons-up-down')).toBeInTheDocument();
    expect(signInLink.querySelector('.lucide-user-round')).toBeInTheDocument();
  });

  it('sends pending visitors who selected designer registration to designer onboarding', () => {
    render(<PublicHeader isAuthenticated userRole="visitor" userStatus="pending" />);

    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/designer/onboarding',
    );
    expect(screen.getByText('Account menu')).toHaveAttribute('data-profile-settings', 'false');
  });

  it('can hide List your work while preserving the authenticated account menu', () => {
    render(<PublicHeader isAuthenticated userRole="visitor" showListYourWork={false} />);

    expect(screen.queryByRole('link', { name: /list your work/i })).not.toBeInTheDocument();
    expect(screen.getByText('Account menu')).toBeInTheDocument();
  });

  it('makes designer profile settings available from public pages', () => {
    render(<PublicHeader isAuthenticated userRole="designer" />);

    expect(screen.getByText('Account menu')).toHaveAttribute('data-profile-settings', 'true');
  });

  it('sends active visitors to a role-safe explanation instead of designer onboarding', () => {
    render(
      <PublicHeader
        isAuthenticated
        userRole="visitor"
        userStatus="active"
        contextSwitcher={<div>Context switcher</div>}
      />,
    );

    expect(screen.getByText('Context switcher')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/home/list-your-work',
    );
  });

  it('does not route a suspended visitor into a protected visitor flow', () => {
    render(<PublicHeader isAuthenticated userRole="visitor" userStatus="suspended" />);

    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/unauthorized',
    );
  });

  it('sends signed-in designers to the designer dashboard', () => {
    render(<PublicHeader isAuthenticated userRole="designer" />);

    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/designer/dashboard',
    );
  });

  it.each(['admin', 'superadmin'])(
    'sends signed-in %s users to the admin dashboard',
    (userRole) => {
      render(<PublicHeader isAuthenticated userRole={userRole} />);

      expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
        'href',
        '/dashboard',
      );
    },
  );
});
