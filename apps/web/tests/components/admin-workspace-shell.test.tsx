import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: ({ avatarSeed }: { avatarSeed: string }) => <div>{avatarSeed}</div>,
}));

import { AdminWorkspaceShell } from '../../src/components/admin-workspace-shell';

describe('AdminWorkspaceShell', () => {
  beforeEach(() => {
    mocks.pathname = '/dashboard';
  });

  it('uses the workspace shell with every admin destination', () => {
    render(
      <AdminWorkspaceShell adminName="Admin User">
        <p>Dashboard content</p>
      </AdminWorkspaceShell>,
    );

    expect(screen.getAllByRole('link', { name: 'Dashboard' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    const projectModerationLink = screen.getAllByRole('link', {
      name: 'Project moderation',
    })[0];
    expect(projectModerationLink).toHaveAttribute('href', '/moderation');
    expect(projectModerationLink?.querySelector('.lucide-square-chart-gantt')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Review moderation' })[0]).toHaveAttribute(
      'href',
      '/review-moderation',
    );
    const profileVerificationLink = screen.getAllByRole('link', {
      name: 'Profile verification',
    })[0];
    expect(profileVerificationLink).toHaveAttribute('href', '/verifications');
    expect(profileVerificationLink?.querySelector('.lucide-shield-user')).toBeInTheDocument();
    expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Explore Tickif/i })).not.toBeInTheDocument();
  });

  it('exposes the same mobile navigation pattern as the designer workspace', () => {
    render(
      <AdminWorkspaceShell adminName="Admin User">
        <p>Dashboard content</p>
      </AdminWorkspaceShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog', { name: 'Admin navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();
  });
});
