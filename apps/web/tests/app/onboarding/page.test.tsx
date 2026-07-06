import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  requireAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
  rolePassesCheck: vi.fn(),
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('VisitorOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the visitor onboarding welcome for signed-in visitors', async () => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    const page = await Page();
    render(page);

    expect(screen.getByText('Welcome to Tickif')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start exploring/i })).toHaveAttribute('href', '/');
  });

  it('redirects designers into the designer dashboard', async () => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(true);

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/dashboard');
  });
});
