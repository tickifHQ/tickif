import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  requireAuth: vi.fn(),
  cookies: vi.fn(),
  router: {
    push: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
  useRouter: () => mock.router,
}));

vi.mock('next/headers', () => ({
  cookies: mock.cookies,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
  rolePassesCheck: vi.fn(),
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('VisitorOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.cookies.mockResolvedValue({ has: vi.fn().mockReturnValue(false) });
  });

  it('renders the visitor onboarding profile setup for signed-in visitors', async () => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: {
        id: 'u1',
        name: '+919123456789',
        email: 'mahi@test.com',
        phoneNumber: '+919123456789',
        role: 'visitor',
      },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    const page = await Page();
    render(page);

    expect(screen.getByText("Let's set up your space on Tickif")).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('');
    expect(screen.getByLabelText(/^phone number$/i)).toHaveValue('+919123456789');
    expect(screen.getByLabelText(/^address$/i)).toHaveValue('');
    expect(screen.getByLabelText(/whatsapp number/i)).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Skip' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
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

  it('redirects completed visitors to the homepage', async () => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);
    mock.cookies.mockResolvedValue({ has: vi.fn().mockReturnValue(true) });

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/');
  });
});
