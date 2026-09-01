import { render, screen } from '@testing-library/react';
import type { OrganizationWorkspaceResponse } from '@repo/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
  getWorkspace: vi.fn(),
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
        current: {
          $get: mocks.getWorkspace,
        },
      },
    },
  },
}));

vi.mock('@/components/designer-terms-roles', () => ({
  DesignerTermsRoles: ({
    workspace,
    error,
  }: {
    workspace: OrganizationWorkspaceResponse | null;
    error?: string;
  }) => (
    <div>
      <div data-testid="organization">{workspace?.organization.name ?? ''}</div>
      <div data-testid="error">{error ?? ''}</div>
    </div>
  ),
}));

const workspace: OrganizationWorkspaceResponse = {
  organization: { id: 'org-1', name: 'Studio One', slug: 'studio-one', logo: null },
  currentUserRole: 'owner',
  canManage: true,
  rbacEnabled: true,
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
};

describe('DesignerTermsRolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue({ get: () => 'session=abc' });
    mocks.getWorkspace.mockResolvedValue(
      new Response(JSON.stringify(workspace), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('requires designer auth and loads the active organization through the typed API', async () => {
    const { default: Page } = await import('../../../../app/(designer)/designer/terms-roles/page');

    render(await Page());

    expect(mocks.requireAuth).toHaveBeenCalledWith({ requiredRole: 'designer' });
    expect(mocks.getWorkspace).toHaveBeenCalledWith({}, { headers: { cookie: 'session=abc' } });
    expect(screen.getByTestId('organization')).toHaveTextContent('Studio One');
  });

  it('surfaces a load error when the organization API fails', async () => {
    mocks.getWorkspace.mockResolvedValue(new Response(null, { status: 500 }));
    const { default: Page } = await import('../../../../app/(designer)/designer/terms-roles/page');

    render(await Page());

    expect(screen.getByTestId('error')).toHaveTextContent('Could not load your studio team.');
  });
});
