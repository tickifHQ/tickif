import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getServerSession: vi.fn(),
  headers: vi.fn(),
  fetchOnboardingDraft: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

// The page server-fetches the E-298 onboarding draft, which reads the request
// `cookie` via next/headers. Mock it so the render path has a request scope.
vi.mock('next/headers', () => ({
  headers: mock.headers,
}));

vi.mock('@/lib/onboarding-draft-api', () => ({
  fetchOnboardingDraft: mock.fetchOnboardingDraft,
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
  rolePassesCheck: vi.fn(),
}));

vi.mock('@/components/designer-onboarding', () => ({
  DesignerOnboarding: () => <div data-testid="designer-onboarding">Onboarding form</div>,
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('DesignerOnboardingPage', () => {
  it('keeps the writable wizard unmounted after a failed draft load and offers retry', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1' },
      user: { role: 'visitor', status: 'pending', email: 'mahi@test.com' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);
    mock.fetchOnboardingDraft.mockRejectedValue(new Error('Network unavailable'));
    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    render(await Page());
    expect(screen.queryByTestId('designer-onboarding')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /try again/i })).toHaveAttribute(
      'href',
      '/designer/onboarding',
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mock.headers.mockResolvedValue(new Headers({ cookie: 'session=abc' }));
    mock.fetchOnboardingDraft.mockResolvedValue(null);
  });

  it('redirects to dashboard when user is already a designer', async () => {
    mock.getServerSession.mockResolvedValue({
      session: {
        id: 's1',
        token: 't1',
        expiresAt: '2026-06-30T00:00:00.000Z',
        activeOrganizationId: 'org-1',
      },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockImplementation(
      (_role, requiredRole) => requiredRole === 'designer',
    );

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/dashboard');
  });

  it('redirects designers without an active organization to studio selection', async () => {
    mock.getServerSession.mockResolvedValue({
      session: {
        id: 's1',
        token: 't1',
        expiresAt: '2026-06-30T00:00:00.000Z',
        activeOrganizationId: null,
      },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockImplementation(
      (_role, requiredRole) => requiredRole === 'designer',
    );

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/select-studio');
  });

  it('renders onboarding form when user is not yet a designer', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-06-30T00:00:00.000Z' },
      user: {
        id: 'u1',
        name: 'Mahi',
        email: 'mahi@test.com',
        role: 'visitor',
        status: 'pending',
      },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    const page = await Page();
    render(page);

    expect(screen.getByTestId('designer-onboarding')).toBeInTheDocument();
    expect(mock.redirect).not.toHaveBeenCalled();
  });

  it('sends an active visitor to the role-safe List your work explanation', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-06-30T00:00:00.000Z' },
      user: {
        id: 'u1',
        name: 'Mahi',
        email: 'mahi@test.com',
        role: 'visitor',
        status: 'active',
      },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/home/list-your-work');
  });

  it('routes an admin without an active organization to the admin dashboard', async () => {
    mock.getServerSession.mockResolvedValue({
      session: {
        id: 's1',
        token: 't1',
        expiresAt: '2026-06-30T00:00:00.000Z',
        activeOrganizationId: null,
      },
      user: { id: 'u1', name: 'Admin', email: 'admin@test.com', role: 'admin' },
    });
    vi.mocked(rolePassesCheck).mockImplementation(
      (_role, requiredRole) => requiredRole === 'admin' || requiredRole === 'designer',
    );

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/dashboard');
  });
});
