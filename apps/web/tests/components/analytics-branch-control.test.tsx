import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsBranchControl } from '../../src/components/analytics-branch-control';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
  branchesGet: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/designer/analytics',
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.params,
}));

vi.mock('../../src/lib/api', () => ({
  api: { api: { orgs: { branches: { $get: mocks.branchesGet } } } },
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
      memberCount: 1,
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
};

describe('AnalyticsBranchControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = new URLSearchParams();
    mocks.branchesGet.mockResolvedValue({
      ok: true,
      json: async () => structuredClone(branchesPayload),
    });
  });

  it('scopes the page to the selected branch without touching the shell switcher', async () => {
    const user = userEvent.setup();
    render(<AnalyticsBranchControl />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Branch' }), 'team-2');

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/designer/analytics?branchId=team-2');
    });
  });

  it('returns to the organization roll-up when cleared', async () => {
    mocks.params = new URLSearchParams('branchId=team-2');
    const user = userEvent.setup();
    render(<AnalyticsBranchControl />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Branch' }), '');

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/designer/analytics');
    });
  });

  it('keeps every branch selectable after a branch is selected', async () => {
    const user = userEvent.setup();
    render(<AnalyticsBranchControl />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Branch' }), 'team-2');

    expect(
      within(screen.getByRole('combobox', { name: 'Branch' })).getByRole('option', {
        name: 'Andheri',
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('combobox', { name: 'Branch' })).getByRole('option', {
        name: 'Bandra',
      }),
    ).toBeInTheDocument();
  });
});
