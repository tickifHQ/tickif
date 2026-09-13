import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
}));

vi.mock('@/components/admin-workspace-shell', () => ({
  AdminWorkspaceShell: ({
    adminName,
    children,
  }: {
    adminName: string;
    children: React.ReactNode;
  }) => (
    <main data-admin-name={adminName}>
      <a href="/verifications">Profile verification</a>
      {children}
    </main>
  ),
}));

vi.mock('@/components/protected-bfcache-guard', () => ({
  ProtectedBfcacheGuard: () => null,
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireAuth.mockResolvedValue({
      user: { role: 'admin', name: 'Admin User' },
      session: {},
    });
  });

  it('uses the shared login while enforcing the admin role on the server', async () => {
    const { default: Layout } = await import('../../../app/(admin)/layout');
    render(await Layout({ children: <div>Moderation</div> }));

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(screen.getByRole('main')).toHaveTextContent('Moderation');
    expect(screen.getByRole('main')).toHaveAttribute('data-admin-name', 'Admin User');
    expect(screen.getByRole('link', { name: 'Profile verification' })).toHaveAttribute(
      'href',
      '/verifications',
    );
  });
});
