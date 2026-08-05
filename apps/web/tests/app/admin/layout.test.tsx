import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
}));

vi.mock('@/components/site-nav', () => ({
  SiteNav: () => <nav>Admin navigation</nav>,
}));

vi.mock('@/components/site-footer', () => ({
  SiteFooter: () => <footer>Footer</footer>,
}));

vi.mock('@/components/protected-bfcache-guard', () => ({
  ProtectedBfcacheGuard: () => null,
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.requireAuth.mockResolvedValue({ user: { role: 'admin' }, session: {} });
  });

  it('uses the shared login while enforcing the admin role on the server', async () => {
    const { default: Layout } = await import('../../../app/(admin)/layout');
    render(await Layout({ children: <div>Moderation</div> }));

    expect(mock.requireAuth).toHaveBeenCalledWith({ requiredRole: 'admin' });
    expect(screen.getByText('Moderation')).toBeInTheDocument();
  });
});
