import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn().mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  requireAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

vi.mock('@/lib/auth-guard', () => ({ requireAuth: mocks.requireAuth }));

vi.mock('@/components/designer-membership-exit', () => ({
  DesignerMembershipExit: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="membership-exit">{organizationId}</div>
  ),
}));

describe('DesignerManageMembershipPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the leave-only recovery surface for the active organization', async () => {
    mocks.requireAuth.mockResolvedValue({
      session: { activeOrganizationId: 'org-1' },
      user: { role: 'designer' },
    });
    const { default: Page } =
      await import('../../../../app/(protected)/designer/manage-membership/page');

    render(await Page());

    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(screen.getByTestId('membership-exit')).toHaveTextContent('org-1');
  });

  it('returns to studio selection when no active organization remains', async () => {
    mocks.requireAuth.mockResolvedValue({
      session: { activeOrganizationId: null },
      user: { role: 'designer' },
    });
    const { default: Page } =
      await import('../../../../app/(protected)/designer/manage-membership/page');

    await expect(Page()).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.redirect).toHaveBeenCalledWith('/designer/select-studio');
  });
});
