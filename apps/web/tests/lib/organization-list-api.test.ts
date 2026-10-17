import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadBranchMembersPage,
  loadBranchesPage,
  loadOrganizationInvitationsPage,
  loadOrganizationMembersPage,
} from '@/lib/organization-list-api';

const requests = vi.hoisted(() => ({
  members: vi.fn(),
  invitations: vi.fn(),
  branches: vi.fn(),
  branchMembers: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api: {
    api: {
      orgs: {
        members: { $get: requests.members },
        invitations: { $get: requests.invitations },
        branches: {
          list: { $get: requests.branches },
          ':branchId': { members: { $get: requests.branchMembers } },
        },
      },
    },
  },
}));

const query = { page: 2, limit: 24, q: 'Morgan@example.com' };
const payload = { items: [], page: 2, limit: 24, total: 30, totalPages: 2 };
const branchesPayload = {
  ...payload,
  activeTeamId: 'branch-active',
  branchUsage: 30,
  branchLimit: -1,
};

describe('organization list API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requests.members.mockImplementation(async () => Response.json(payload));
    requests.invitations.mockImplementation(async () => Response.json(payload));
    requests.branches.mockImplementation(async () => Response.json(branchesPayload));
    requests.branchMembers.mockImplementation(async () => Response.json(payload));
  });

  it('requests organization members with server search, paging, and cancellable uncached transport', async () => {
    const controller = new AbortController();
    await expect(loadOrganizationMembersPage(query, controller.signal)).resolves.toEqual(payload);
    expect(requests.members).toHaveBeenCalledWith(
      { query: { page: '2', limit: '24', q: 'Morgan@example.com' } },
      { init: { signal: controller.signal, cache: 'no-store' } },
    );
    controller.abort();
    expect(requests.members.mock.calls[0]![1].init.signal.aborted).toBe(true);
  });

  it('passes eligible-transfer and available-branch filters to the member endpoint', async () => {
    const signal = new AbortController().signal;
    await loadOrganizationMembersPage(query, signal, { transferEligible: true });
    expect(requests.members.mock.calls[0]![0].query).toEqual({
      page: '2',
      limit: '24',
      q: 'Morgan@example.com',
      transferEligible: 'true',
    });
    await loadOrganizationMembersPage(query, signal, { availableForBranchId: 'branch-downtown' });
    expect(requests.members.mock.calls[1]![0].query).toEqual({
      page: '2',
      limit: '24',
      q: 'Morgan@example.com',
      availableForBranchId: 'branch-downtown',
    });
  });

  it('requests invitation pages with email search and abort signal', async () => {
    const signal = new AbortController().signal;
    await expect(loadOrganizationInvitationsPage(query, signal)).resolves.toEqual(payload);
    expect(requests.invitations).toHaveBeenCalledWith(
      { query: { page: '2', limit: '24', q: 'Morgan@example.com' } },
      { init: { signal, cache: 'no-store' } },
    );
  });

  it('uses the branches.list endpoint and retains page metadata and workspace limits', async () => {
    const signal = new AbortController().signal;
    await expect(loadBranchesPage(query, signal)).resolves.toEqual(branchesPayload);
    expect(requests.branches).toHaveBeenCalledWith(
      { query: { page: '2', limit: '24', q: 'Morgan@example.com' } },
      { init: { signal, cache: 'no-store' } },
    );
    await loadBranchesPage(query, signal, 'branch-being-removed');
    expect(requests.branches.mock.calls[1]![0].query).toEqual({
      page: '2',
      limit: '24',
      q: 'Morgan@example.com',
      removalTargetFor: 'branch-being-removed',
    });
  });

  it('scopes member pages to the requested branch, preserving its query and abort signal', async () => {
    const signal = new AbortController().signal;
    await expect(loadBranchMembersPage('branch-downtown', query, signal)).resolves.toEqual(payload);
    expect(requests.branchMembers).toHaveBeenCalledWith(
      {
        param: { branchId: 'branch-downtown' },
        query: { page: '2', limit: '24', q: 'Morgan@example.com' },
      },
      { init: { signal, cache: 'no-store' } },
    );
  });

  it.each([
    { name: 'members', request: requests.members, load: loadOrganizationMembersPage },
    { name: 'invitations', request: requests.invitations, load: loadOrganizationInvitationsPage },
    { name: 'branches', request: requests.branches, load: loadBranchesPage },
    {
      name: 'branch members',
      request: requests.branchMembers,
      load: (q: typeof query, signal: AbortSignal) =>
        loadBranchMembersPage('branch-downtown', q, signal),
    },
  ])(
    'rejects invalid success payloads and preserves authorization errors for $name',
    async ({ request, load }) => {
      const signal = new AbortController().signal;
      request.mockResolvedValueOnce(Response.json({ ...payload, page: 0 }));
      await expect(load(query, signal)).rejects.toThrow();
      request.mockResolvedValueOnce(
        Response.json(
          { error: { message: 'You do not have access to this studio.' } },
          { status: 403 },
        ),
      );
      await expect(load(query, signal)).rejects.toThrow('You do not have access to this studio.');
    },
  );
});
