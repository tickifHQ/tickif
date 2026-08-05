import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getServerSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
  rolePassesCheck: vi.fn(),
}));

vi.mock('@/components/login-card', () => ({
  LoginCard: ({ intent }: { intent?: string }) => (
    <div data-testid="login-card" data-intent={intent}>
      Login card
    </div>
  ),
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('AdminLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dedicated admin login for an unauthenticated user', async () => {
    mock.getServerSession.mockResolvedValue(null);
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../../app/(auth)/admin/login/page');
    render(await Page());

    expect(mock.getServerSession).toHaveBeenCalledWith({ disableCookieCache: true });
    expect(screen.getByTestId('login-card')).toHaveAttribute('data-intent', 'admin');
  });

  it.each(['admin', 'superadmin'])('routes an authenticated %s to moderation', async (role) => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', activeOrganizationId: null },
      user: { id: 'u1', name: 'Admin', email: 'admin@test.com', role },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(true);

    const { default: Page } = await import('../../../../app/(auth)/admin/login/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/admin/moderation');
  });

  it('rejects an authenticated non-admin', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', activeOrganizationId: null },
      user: { id: 'u1', name: 'Designer', email: 'designer@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../../app/(auth)/admin/login/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/unauthorized');
  });
});
