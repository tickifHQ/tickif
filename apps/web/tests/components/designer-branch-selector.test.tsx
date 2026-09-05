import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationBranchesResponse } from '@repo/contracts';
import { DesignerBranchSelector } from '../../src/components/designer-branch-selector';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  branchesGet: vi.fn(),
  contextPut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('../../src/lib/api', () => ({
  api: {
    api: {
      orgs: {
        branches: { $get: mocks.branchesGet },
        context: { $put: mocks.contextPut },
      },
    },
  },
}));

const branchesPayload = {
  activeTeamId: 'team-1',
  branchUsage: 2,
  branchLimit: -1,
  branches: [
    {
      id: 'team-1',
      name: 'Andheri',
      profileId: '11111111-1111-4111-8111-111111111111',
      profileSlug: 'andheri-studio',
      profileStatus: 'active',
      projectCount: 1,
      memberCount: 0,
      averageRating: 0,
      reviewCount: 0,
      footprint: [],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-01T00:00:00.000Z',
      members: [],
    },
    {
      id: 'team-2',
      name: 'Bandra',
      profileId: '22222222-2222-4222-8222-222222222222',
      profileSlug: 'bandra-studio',
      profileStatus: 'active',
      projectCount: 0,
      memberCount: 0,
      averageRating: 0,
      reviewCount: 0,
      footprint: [],
      frozen: false,
      frozenAt: null,
      freezeRank: null,
      createdAt: '2026-08-02T00:00:00.000Z',
      members: [],
    },
  ],
} satisfies OrganizationBranchesResponse;

type BranchesResponse = {
  ok: boolean;
  json: () => Promise<typeof branchesPayload>;
};

function createBranchesResponse() {
  let resolve!: (value: BranchesResponse) => void;
  const promise = new Promise<BranchesResponse>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('DesignerBranchSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.branchesGet.mockResolvedValue({
      ok: true,
      json: async () => structuredClone(branchesPayload),
    });
    mocks.contextPut.mockResolvedValue({ ok: true });
  });

  it('stays hidden in personal context', () => {
    const { container } = render(<DesignerBranchSelector organizationId={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.branchesGet).not.toHaveBeenCalled();
  });

  it('stays hidden with a single branch', async () => {
    mocks.branchesGet.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...structuredClone(branchesPayload),
        branches: [branchesPayload.branches[0]!],
        branchUsage: 1,
      }),
    });
    const { container } = render(<DesignerBranchSelector organizationId="org-1" />);

    await waitFor(() => {
      expect(mocks.branchesGet).toHaveBeenCalled();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('switches branches through the context API and refreshes', async () => {
    const initialResponse = createBranchesResponse();
    mocks.branchesGet.mockReturnValueOnce(initialResponse.promise);
    const user = userEvent.setup();
    render(<DesignerBranchSelector organizationId="org-1" />);

    await act(async () => {
      initialResponse.resolve({ ok: true, json: async () => structuredClone(branchesPayload) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Switch branch' })).toHaveTextContent('Andheri');
    await user.click(screen.getByRole('button', { name: 'Switch branch' }));
    await user.click(screen.getByRole('menuitem', { name: /^Bandra/i }));

    await waitFor(() => {
      expect(mocks.contextPut).toHaveBeenCalledWith({
        json: { kind: 'organization', organizationId: 'org-1', teamId: 'team-2' },
      });
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('clears branches from the previous organization while the next context loads', async () => {
    const initialResponse = createBranchesResponse();
    mocks.branchesGet.mockReturnValueOnce(initialResponse.promise);
    const { rerender } = render(<DesignerBranchSelector organizationId="org-1" />);
    await act(async () => {
      initialResponse.resolve({ ok: true, json: async () => structuredClone(branchesPayload) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Switch branch' })).toHaveTextContent('Andheri');

    const nextResponse = createBranchesResponse();
    mocks.branchesGet.mockReturnValueOnce(nextResponse.promise);
    act(() => {
      rerender(<DesignerBranchSelector organizationId="org-2" />);
    });

    expect(screen.queryByRole('button', { name: 'Switch branch' })).not.toBeInTheDocument();

    await act(async () => {
      nextResponse.resolve({ ok: true, json: async () => structuredClone(branchesPayload) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Switch branch' })).toBeInTheDocument();
  });
});
