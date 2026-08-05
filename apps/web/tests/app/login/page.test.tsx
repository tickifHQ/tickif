import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  rolePassesCheck: vi.fn((role: string | null, requiredRole: string) =>
    requiredRole === 'admin' ? role === 'admin' || role === 'superadmin' : false,
  ),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
  rolePassesCheck: mock.rolePassesCheck,
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@/components/login-card', () => ({
  LoginCard: ({ initialMode }: { initialMode: string }) => (
    <div data-testid="login-card" data-mode={initialMode} />
  ),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.getServerSession.mockResolvedValue(null);
  });

  it('renders the shared email login mode for signed-out users', async () => {
    const { default: Page } = await import('../../../app/login/page');
    render(await Page({ searchParams: Promise.resolve({ mode: 'designer' }) }));

    expect(mock.getServerSession).toHaveBeenCalledWith({ disableCookieCache: true });
    expect(screen.getByTestId('login-card')).toHaveAttribute('data-mode', 'designer');
  });

  it.each(['admin', 'superadmin'])('redirects an authenticated %s to moderation on the server', async (role) => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u1', name: 'Admin', email: 'admin@test.com', role },
      session: { id: 's1', token: 'token', expiresAt: new Date().toISOString() },
    });
    const { default: Page } = await import('../../../app/login/page');

    await expect(Page({ searchParams: Promise.resolve({ mode: 'designer' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/admin/moderation',
    );
  });

  it('continues an authenticated designer to designer onboarding on the server', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u2', name: 'Designer', email: 'designer@test.com', role: 'designer' },
      session: { id: 's2', token: 'token', expiresAt: new Date().toISOString() },
    });
    const { default: Page } = await import('../../../app/login/page');

    await expect(Page({ searchParams: Promise.resolve({ mode: 'designer' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/designer/onboarding',
    );
  });

  it('keeps the existing home redirect for an authenticated visitor', async () => {
    mock.getServerSession.mockResolvedValue({
      user: { id: 'u3', name: 'Visitor', email: 'visitor@test.com', role: 'visitor' },
      session: { id: 's3', token: 'token', expiresAt: new Date().toISOString() },
    });
    const { default: Page } = await import('../../../app/login/page');

    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/',
    );
  });
});
