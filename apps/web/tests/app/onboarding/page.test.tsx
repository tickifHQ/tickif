import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  requireAuth: vi.fn(),
  router: {
    push: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
  useRouter: () => mock.router,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mock.requireAuth,
}));

vi.mock('@/lib/visitor-feed.server', () => ({
  getVisitorFeedPreferences: async () => ({ preferences: null, filters: {} }),
}));
vi.mock('@/components/visitor-onboarding-form', () => ({
  VisitorOnboardingForm: () => <div data-testid="welcome" />,
}));

describe('VisitorOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders saved preferences for signed-in visitors', async () => {
    mock.requireAuth.mockResolvedValue({
      session: {},
      user: { role: 'visitor', status: 'pending' },
    });
    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    render(await Page());
    expect(screen.getByTestId('welcome')).toBeInTheDocument();
  });

  it('redirects designers into the designer dashboard', async () => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/dashboard');
  });

  it('allows active visitors to edit their feed preferences', async () => {
    mock.requireAuth.mockResolvedValue({
      session: {},
      user: { role: 'visitor', status: 'active' },
    });
    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    render(await Page());
    expect(screen.getByTestId('welcome')).toBeInTheDocument();
  });

  it.each([
    ['admin', '/dashboard'],
    ['superadmin', '/dashboard'],
  ] as const)('redirects %s accounts to the admin dashboard', async (role, destination) => {
    mock.requireAuth.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-07-02T00:00:00.000Z' },
      user: { id: 'u1', name: 'Admin', email: 'admin@test.com', role, status: 'active' },
    });

    const { default: Page } = await import('../../../app/(protected)/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith(destination);
  });
});
