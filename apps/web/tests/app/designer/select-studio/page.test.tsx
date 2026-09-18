import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/components/designer-organization-switcher', () => ({
  DesignerOrganizationSwitcher: ({
    activeOrganizationId,
    studioName,
    secondaryLabel,
  }: {
    activeOrganizationId: string | null;
    studioName: string;
    secondaryLabel: string;
  }) => (
    <div
      data-testid="studio-switcher"
      data-active-organization-id={activeOrganizationId}
      data-studio-name={studioName}
      data-secondary-label={secondaryLabel}
    />
  ),
}));

import { rolePassesCheck } from '@/lib/auth-guard';

describe('DesignerSelectStudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the studio selector for a designer without an active organization', async () => {
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

    const { default: Page } =
      await import('../../../../app/(protected)/designer/select-studio/page');
    render(await Page());

    expect(screen.getByRole('heading', { name: 'Choose your studio' })).toBeInTheDocument();
    expect(screen.getByText(/Select the studio workspace/)).toBeInTheDocument();
    expect(screen.getByTestId('studio-switcher')).toHaveAttribute('data-studio-name', 'Mahi');
    expect(screen.getByTestId('studio-switcher')).toHaveAttribute(
      'data-secondary-label',
      'Choose a studio',
    );
    expect(mock.redirect).not.toHaveBeenCalled();
  });

  it('redirects a designer with an active organization and branch to the dashboard', async () => {
    mock.getServerSession.mockResolvedValue({
      session: {
        id: 's1',
        token: 't1',
        expiresAt: '2026-06-30T00:00:00.000Z',
        activeOrganizationId: 'org-1',
        activeTeamId: 'branch-1',
      },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
    });
    vi.mocked(rolePassesCheck).mockImplementation(
      (_role, requiredRole) => requiredRole === 'designer',
    );

    const { default: Page } =
      await import('../../../../app/(protected)/designer/select-studio/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/dashboard');
  });

  it.each([null, undefined])(
    'keeps recovery available when the active branch is %s',
    async (activeTeamId) => {
      mock.getServerSession.mockResolvedValue({
        session: { activeOrganizationId: 'org-1', activeTeamId },
        user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'designer' },
      });
      vi.mocked(rolePassesCheck).mockImplementation(
        (_role, requiredRole) => requiredRole === 'designer',
      );

      const { default: Page } =
        await import('../../../../app/(protected)/designer/select-studio/page');
      render(await Page());

      expect(mock.redirect).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Choose your studio' })).toBeInTheDocument();
      // The current studio must remain selectable to restore its default branch.
      expect(screen.getByTestId('studio-switcher')).not.toHaveAttribute(
        'data-active-organization-id',
      );
      expect(mock.getServerSession).toHaveBeenCalledWith({ disableCookieCache: true });
    },
  );

  it('redirects non-designers to designer onboarding', async () => {
    mock.getServerSession.mockResolvedValue({
      session: { id: 's1', token: 't1', expiresAt: '2026-06-30T00:00:00.000Z' },
      user: { id: 'u1', name: 'Mahi', email: 'mahi@test.com', role: 'visitor' },
    });
    vi.mocked(rolePassesCheck).mockReturnValue(false);

    const { default: Page } =
      await import('../../../../app/(protected)/designer/select-studio/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/designer/onboarding');
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

    const { default: Page } =
      await import('../../../../app/(protected)/designer/select-studio/page');
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mock.redirect).toHaveBeenCalledWith('/dashboard');
  });
});
