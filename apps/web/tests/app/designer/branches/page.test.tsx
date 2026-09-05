import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
  branchesGet: vi.fn(),
  workspaceGet: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('@/lib/api', () => ({
  api: {
    api: {
      orgs: {
        branches: { $get: mocks.branchesGet },
        current: { $get: mocks.workspaceGet },
      },
    },
  },
}));

vi.mock('@/components/designer-branches', () => ({
  DesignerBranches: () => <div data-testid="branches">branches</div>,
}));

describe('DesignerBranchesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({ get: () => 'session=abc' });
    mocks.branchesGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        activeTeamId: 'team-1',
        branchUsage: 1,
        branchLimit: -1,
        branches: [],
      }),
    });
    mocks.workspaceGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
        currentUserRole: 'owner',
        canManage: true,
        rbacEnabled: true,
        planTier: 'corporate',
        subscriptionState: 'active',
        seatUsage: 1,
        seatLimit: -1,
        capabilities: {
          billing: true,
          manageMembers: true,
          changeMemberRoles: true,
          transferOwnership: true,
          writeProjects: true,
          submitProjects: true,
          archiveProjects: true,
          deleteProjects: true,
          leadScope: 'full',
          analyticsScope: 'full',
          editOrganization: true,
          manageVerification: true,
        },
        members: [],
        invitations: [],
        ownershipTransfer: null,
      }),
    });
  });

  it('requires designer auth and loads branches through the typed API', async () => {
    const { default: Page } = await import('../../../../app/(designer)/designer/branches/page');

    render(await Page());

    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(mocks.branchesGet).toHaveBeenCalledWith({}, { headers: { cookie: 'session=abc' } });
    expect(screen.getByTestId('branches')).toBeInTheDocument();
  });
});
