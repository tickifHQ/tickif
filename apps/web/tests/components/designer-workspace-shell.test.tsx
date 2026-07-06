import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesignerWorkspaceShell } from '../../src/components/designer-workspace-shell';

const pathnameState = vi.hoisted(() => ({
  value: '/designer/dashboard',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.value,
}));

vi.mock('@/components/account-menu', () => ({
  AccountMenu: () => <div>Account menu</div>,
}));

vi.mock('@/components/initials-avatar', () => ({
  InitialsAvatar: () => <div>Avatar</div>,
}));

describe('DesignerWorkspaceShell', () => {
  it('routes Profile & settings to the designer profile page', () => {
    pathnameState.value = '/designer/dashboard';
    render(
      <DesignerWorkspaceShell studioName="Antika Interiors" studioLocation="Chennai">
        <div>Dashboard content</div>
      </DesignerWorkspaceShell>,
    );

    expect(screen.getByRole('link', { name: /profile & settings/i })).toHaveAttribute(
      'href',
      '/designer/profile',
    );
  });

  it('lets the project upload route size to content instead of forcing a full-height shell pane', () => {
    pathnameState.value = '/designer/projects/upload';
    render(
      <DesignerWorkspaceShell studioName="Antika Interiors" studioLocation="Chennai">
        <div>Upload content</div>
      </DesignerWorkspaceShell>,
    );

    const main = screen.getByText('Upload content').closest('main');
    const section = main?.closest('section');

    expect(main).not.toHaveClass('h-full');
    expect(main).not.toHaveClass('overflow-y-auto');
    expect(section).not.toHaveClass('flex-1');
    expect(section).not.toHaveClass('overflow-hidden');
  });
});
