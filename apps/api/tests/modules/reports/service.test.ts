import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ORGANIZATION_ACCESS_SCOPE,
  ORGANIZATION_MEMBER_ROLE,
  type OrganizationMemberRole,
} from '@repo/contracts';

vi.mock('../../../src/modules/reports/repository.js', () => ({
  reportsRepository: {
    findAccessContext: vi.fn(),
    listActiveProfiles: vi.fn(),
    listFrozenBranches: vi.fn(),
    countProjectsByStatus: vi.fn(),
    countLeadsByStatus: vi.fn(),
    countProjectsCreatedByDay: vi.fn(),
    countLeadsReceivedByDay: vi.fn(),
    countViewsByDay: vi.fn(),
    findTopConvertingProjects: vi.fn(),
    countAcquisitionSources: vi.fn(),
    getBillingAnalytics: vi.fn(),
    getBranchBreakdown: vi.fn(),
  },
}));

const { reportsService } = await import('../../../src/modules/reports/service.js');
const { reportsRepository } = await import('../../../src/modules/reports/repository.js');

const input = { userId: 'user_1', orgId: 'org_1', query: { days: 7 } };
const profiles = [
  { profileId: '11111111-1111-4111-8111-111111111111', teamId: 'team_1', teamName: 'Mumbai' },
  { profileId: '22222222-2222-4222-8222-222222222222', teamId: 'team_2', teamName: 'Pune' },
];

function mockRole(
  role: OrganizationMemberRole,
  overrides: Partial<{
    frozen: boolean;
    tier: 'hobby' | 'professional_plus' | 'corporate';
    lifecycleState: 'active' | 'payment_failed' | 'grace' | 'locked' | 'downgraded';
  }> = {},
) {
  vi.mocked(reportsRepository.findAccessContext).mockResolvedValue({
    memberId: 'member_1',
    role,
    frozen: overrides.frozen ?? false,
    tier: overrides.tier ?? 'corporate',
    lifecycleState: overrides.lifecycleState ?? 'active',
    currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-07T12:30:00.000Z'));
  mockRole(ORGANIZATION_MEMBER_ROLE.OWNER);
  vi.mocked(reportsRepository.listActiveProfiles).mockResolvedValue(profiles);
  vi.mocked(reportsRepository.listFrozenBranches).mockResolvedValue([]);
  vi.mocked(reportsRepository.countProjectsByStatus).mockResolvedValue([]);
  vi.mocked(reportsRepository.countLeadsByStatus).mockResolvedValue([]);
  vi.mocked(reportsRepository.countProjectsCreatedByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.countLeadsReceivedByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.countViewsByDay).mockResolvedValue([]);
  vi.mocked(reportsRepository.findTopConvertingProjects).mockResolvedValue([]);
  vi.mocked(reportsRepository.countAcquisitionSources).mockResolvedValue([]);
  vi.mocked(reportsRepository.getBranchBreakdown).mockResolvedValue([]);
  vi.mocked(reportsRepository.getBillingAnalytics).mockResolvedValue([
    {
      currency: 'INR',
      capturedAmount: 299900,
      failedAmount: 799900,
      transactionCount: 2,
      capturedTransactions: 1,
      failedTransactions: 1,
    },
  ]);
});

afterAll(() => vi.useRealTimers());

describe('reportsService.getAnalytics', () => {
  it.each([
    [ORGANIZATION_MEMBER_ROLE.OWNER, ORGANIZATION_ACCESS_SCOPE.FULL, false],
    [ORGANIZATION_MEMBER_ROLE.ADMIN, ORGANIZATION_ACCESS_SCOPE.FULL, false],
    [ORGANIZATION_MEMBER_ROLE.VIEWER, ORGANIZATION_ACCESS_SCOPE.ORGANIZATION, true],
  ] as const)('returns the %s analytics view', async (role, expectedScope, readOnly) => {
    mockRole(role);
    const result = await reportsService.getAnalytics(input);
    expect(result.access).toMatchObject({ role, roleScope: expectedScope, readOnly });
    expect(result.billing).toBeNull();
    expect(reportsRepository.countProjectsByStatus).toHaveBeenCalled();
    expect(reportsRepository.getBranchBreakdown).toHaveBeenCalledTimes(
      expectedScope === ORGANIZATION_ACCESS_SCOPE.FULL ? 1 : 0,
    );
  });

  it('filters every project-derived metric for a member and excludes profile views', async () => {
    mockRole(ORGANIZATION_MEMBER_ROLE.MEMBER);
    vi.mocked(reportsRepository.countViewsByDay).mockResolvedValue([
      { type: 'project_view', date: '2026-08-07', count: 3 },
    ]);
    const result = await reportsService.getAnalytics(input);
    const scope = {
      orgId: 'org_1',
      profileIds: profiles.map(({ profileId }) => profileId),
      teamIds: profiles.map(({ teamId }) => teamId),
      responsibleMemberId: 'member_1',
    };
    expect(reportsRepository.countProjectsByStatus).toHaveBeenCalledWith(scope);
    for (const method of [
      reportsRepository.countLeadsByStatus,
      reportsRepository.countProjectsCreatedByDay,
      reportsRepository.countLeadsReceivedByDay,
      reportsRepository.countViewsByDay,
      reportsRepository.findTopConvertingProjects,
      reportsRepository.countAcquisitionSources,
    ]) {
      expect(method).toHaveBeenCalledWith(expect.objectContaining({ scope }));
    }
    expect(result.access.roleScope).toBe(ORGANIZATION_ACCESS_SCOPE.OWN);
    expect(result.engagement).toEqual({ projectViews: 3, profileViews: 0 });
    expect(result.activity.every(({ profileViews }) => profileViews === 0)).toBe(true);
    expect(result.branches).toEqual([]);
  });

  it('returns payment-derived data for a billing admin without designer profiles', async () => {
    mockRole(ORGANIZATION_MEMBER_ROLE.BILLING_ADMIN);
    vi.mocked(reportsRepository.listActiveProfiles).mockResolvedValue([]);
    const result = await reportsService.getAnalytics(input);
    expect(result.access).toMatchObject({
      roleScope: ORGANIZATION_ACCESS_SCOPE.BILLING,
      engagementVisible: false,
    });
    expect(result.billing?.currencies).toEqual([
      expect.objectContaining({ currency: 'INR', capturedAmount: 299900, failedAmount: 799900 }),
    ]);
    expect(result.projects.total).toBe(0);
    expect(result.leads.total).toBe(0);
    expect(result.engagement).toEqual({ projectViews: 0, profileViews: 0 });
    expect(reportsRepository.listActiveProfiles).not.toHaveBeenCalled();
    expect(reportsRepository.listFrozenBranches).not.toHaveBeenCalled();
    expect(reportsRepository.countProjectsByStatus).not.toHaveBeenCalled();
  });

  it.each(['hobby', 'professional_plus'] as const)(
    'returns basic analytics and an upgrade marker for %s',
    async (tier) => {
      mockRole(ORGANIZATION_MEMBER_ROLE.OWNER, { tier });
      const result = await reportsService.getAnalytics(input);
      expect(result.access).toMatchObject({ tierScope: 'basic', branchAccess: 'upgrade_required' });
      expect(result.branches).toEqual([]);
    },
  );

  it('keeps basic analytics while locked and suspends a requested branch view', async () => {
    mockRole(ORGANIZATION_MEMBER_ROLE.OWNER, { lifecycleState: 'locked' });
    const basic = await reportsService.getAnalytics(input);
    expect(basic.access).toMatchObject({ tierScope: 'basic', branchAccess: 'suspended' });
    await expect(
      reportsService.getAnalytics({ ...input, query: { days: 7, branchId: 'team_1' } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('scopes a Corporate branch view to one active branch', async () => {
    const result = await reportsService.getAnalytics({
      ...input,
      query: { days: 7, branchId: 'team_2' },
    });
    expect(result.access).toMatchObject({ level: 'branch', branchId: 'team_2' });
    expect(reportsRepository.countProjectsByStatus).toHaveBeenCalledWith({
      orgId: 'org_1',
      profileIds: ['22222222-2222-4222-8222-222222222222'],
      teamIds: ['team_2'],
    });
  });

  it('rejects frozen organization members before reading analytics data', async () => {
    mockRole(ORGANIZATION_MEMBER_ROLE.MEMBER, { frozen: true });
    await expect(reportsService.getAnalytics(input)).rejects.toMatchObject({ status: 403 });
    expect(reportsRepository.listActiveProfiles).not.toHaveBeenCalled();
  });

  it('rejects requests without an active organization before querying', async () => {
    await expect(reportsService.getAnalytics({ ...input, orgId: null })).rejects.toMatchObject({
      status: 422,
    });
    expect(reportsRepository.findAccessContext).not.toHaveBeenCalled();
  });
});
