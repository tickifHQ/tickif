import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteNav } from '../../src/components/site-nav';

vi.mock('@/components/account-menu', () => ({
  AccountMenu: () => <div>Account menu</div>,
}));

describe('SiteNav', () => {
  it('renders the default brand and discovery links', () => {
    render(<SiteNav />);
    // Brand appears once; default links render in both desktop + mobile menus.
    expect(screen.getByText('Tickif')).toBeInTheDocument();
    expect(screen.getAllByText('Discover').length).toBeGreaterThan(0);
    expect(screen.getAllByText('For designers').length).toBeGreaterThan(0);
  });

  it('accepts a custom brand and link set', () => {
    render(
      <SiteNav brand="Tickif · Admin" links={[{ href: '/admin/dashboard', label: 'Dashboard' }]} />,
    );
    expect(screen.getByText('Tickif · Admin')).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('exposes a mobile disclosure toggle', () => {
    render(<SiteNav />);
    expect(screen.getByLabelText('Toggle navigation menu')).toBeInTheDocument();
  });
});
