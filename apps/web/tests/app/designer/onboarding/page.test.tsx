import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mock = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => { throw new Error('NEXT_REDIRECT'); }),
  getServerSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mock.redirect,
}));

vi.mock('@/lib/auth-guard', () => ({
  getServerSession: mock.getServerSession,
  rolePassesCheck: vi.fn(),
}));

vi.mock('@/components/designer-onboarding', () => ({
  DesignerOnboarding: () => <div data-testid="designer-onboarding">Onboarding form</div>,
}));

vi.mock('@/components/designer-organization-switcher', () => ({
  DesignerOrganizationSwitcher: () => (
    <div data-testid="designer-organization-switcher">Organization switcher</div>
  ),
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('DesignerOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(rolePassesCheck).mockReturnValue(true);

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/dashboard');
  });

  it('renders studio selection when a designer session has no active organization', async () => {
    mock.getServerSession.mockResolvedValue({
      session: {
        id: 's1',
        token: 't1',
        expiresAt: '2026-06-30T00:00:00.000Z',
        activeOrganizationId: null,
      },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(true);

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    const page = await Page();
    render(page);

    expect(screen.getByRole('heading', { name: 'Choose your studio' })).toBeInTheDocument();
    expect(screen.getByTestId('designer-organization-switcher')).toBeInTheDocument();
    expect(mock.redirect).not.toHaveBeenCalled();
  });

  it('renders onboarding form when user is not yet a designer', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-06-30T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } = await import('../../../../app/(protected)/designer/onboarding/page');
    const page = await Page();
    render(page);

    expect(screen.getByTestId('designer-onboarding')).toBeInTheDocument();
    expect(mock.redirect).not.toHaveBeenCalled();
  });
});
