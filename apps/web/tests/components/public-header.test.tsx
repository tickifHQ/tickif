import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicHeader } from '../../src/components/public-header';

vi.mock('@/components/account-menu', () => ({
  AccountMenu: () => <div>Account menu</div>,
}));

describe('PublicHeader', () => {
  it('sends signed-out users to the designer login mode', () => {
    render(<PublicHeader />);

    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/login?mode=designer',
    );
  });

  it('sends signed-in visitors to designer onboarding', () => {
    render(<PublicHeader isAuthenticated userRole="visitor" />);

    expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
      'href',
      '/designer/onboarding',
    );
  });

  it.each(['designer', 'admin', 'superadmin'])(
    'sends signed-in %s users to the designer dashboard',
    (userRole) => {
      render(<PublicHeader isAuthenticated userRole={userRole} />);

      expect(screen.getByRole('link', { name: /list your work/i })).toHaveAttribute(
        'href',
        '/designer/dashboard',
      );
    },
  );
});
