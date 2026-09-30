import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '@repo/config';
import type { ProfileCompletionResponse } from '@repo/contracts';
import { AppError } from '../../../src/lib/errors.js';
import type {
  DashboardProfileContext,
  ProjectStatusCount,
} from '../../../src/modules/dashboard/repository.js';
import type * as portfolioServiceModule from '../../../src/modules/profiles/portfolio-service.js';

vi.mock('../../../src/modules/dashboard/repository.js', () => ({
  dashboardRepository: {
    findProfileContext: vi.fn(),
    countProjectsByStatus: vi.fn(),
  },
}));

vi.mock('../../../src/modules/profiles/service.js', () => ({
  profilesService: {
    getCompletion: vi.fn(),
  },
}));

vi.mock('../../../src/modules/leads/service.js', () => ({
  leadsService: {
    countForOrganization: vi.fn(),
  },
}));

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: {
    getCapabilities: vi.fn(),
  },
}));

vi.mock('../../../src/modules/profiles/portfolio-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof portfolioServiceModule>();
  return {
    ...actual,
    presignPortfolioHeroCover: vi.fn(),
  };
});

const { dashboardService } = await import('../../../src/modules/dashboard/service.js');
const { dashboardRepository } = await import('../../../src/modules/dashboard/repository.js');
const { profilesService } = await import('../../../src/modules/profiles/service.js');
const { leadsService } = await import('../../../src/modules/leads/service.js');
const { orgsService } = await import('../../../src/modules/orgs/service.js');
const { presignPortfolioHeroCover } =
  await import('../../../src/modules/profiles/portfolio-service.js');

const input = { userId: 'user_1', userRole: 'designer', orgId: 'org_1' };

const profile = (overrides: Partial<DashboardProfileContext> = {}): DashboardProfileContext => ({
  profileId: '11111111-1111-4111-8111-111111111111',
  orgId: 'org_1',
  orgSlug: 'studio-noir',
  teamId: 'team_1',
  profileSlug: 'studio-noir',
  portfolioSlug: 'studio-noir-portfolio',
  logoImageId: 'originals/logos/11111111-1111-4111-8111-111111111111/logo.png',
  displayName: 'Studio Noir',
  bio: 'Thoughtful interiors for real homes.',
  tagline: 'Spaces with depth and warmth',
  heroImageId: 'originals/portfolio-covers/11111111-1111-4111-8111-111111111111/cover.png',
  showHero: true,
  profileStatus: 'active',
  publicLinkEnabled: true,
  memberId: 'member_1',
  memberRole: 'owner',
  verificationStatus: null,
  verificationExpiresAt: null,
  ...overrides,
});

const completion = (
  overrides: Partial<ProfileCompletionResponse> = {},
): ProfileCompletionResponse => ({
  score: 67,
  missing: ['logo', 'scope'],
  steps: [
    { key: 'signed-in-with-google', label: 'Sign in with Google', done: true },
    { key: 'org-created', label: 'Create your organization', done: true },
    { key: 'profile-completed', label: 'Complete your profile', done: false },
    { key: 'first-project-uploaded', label: 'Upload your first project', done: true },
  ],
  ...overrides,
});

const counts = (items: ProjectStatusCount[] = [{ status: 'submitted', count: 1 }]) => items;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(profile());
  vi.mocked(dashboardRepository.countProjectsByStatus).mockResolvedValue(counts());
  vi.mocked(profilesService.getCompletion).mockResolvedValue(completion());
  vi.mocked(leadsService.countForOrganization).mockResolvedValue({ total: 0, new: 0 });
  vi.mocked(presignPortfolioHeroCover).mockResolvedValue(
    'https://cdn.example.com/portfolio-cover.png',
  );
  vi.mocked(orgsService.getCapabilities).mockResolvedValue({
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
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboardService.getProfileDashboard', () => {
  it('returns the Linear E-140 dashboard summary contract', async () => {
    vi.mocked(dashboardRepository.countProjectsByStatus).mockResolvedValue([
      { status: 'published', count: 4 },
      { status: 'submitted', count: 1 },
      { status: 'in_review', count: 2 },
      { status: 'draft', count: 3 },
      { status: 'changes_requested', count: 2 },
      { status: 'rejected', count: 9 },
    ]);
    vi.mocked(leadsService.countForOrganization).mockResolvedValue({ total: 7, new: 3 });

    const result = await dashboardService.getProfileDashboard(input);

    expect(result).toEqual({
      profileCompletion: {
        score: 67,
        missing: ['logo', 'scope'],
      },
      projects: {
        total: 12,
        published: 4,
        inReview: 3,
        draft: 5,
      },
      leads: {
        total: 7,
        new: 3,
      },
      shareUrl: new URL('/d/studio-noir-portfolio', config.PUBLIC_WEB_URL).toString(),
      heroCoverUrl: 'https://cdn.example.com/portfolio-cover.png',
      publiclyVisible: true,
      verificationStatus: null,
    });
    expect(leadsService.countForOrganization).toHaveBeenCalledWith('org_1', 'team_1');
  });

  it('keeps the dashboard usable when the decorative cover cannot be presigned', async () => {
    vi.mocked(presignPortfolioHeroCover).mockRejectedValueOnce(new Error('Storage unavailable'));

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.heroCoverUrl).toBeNull();
  });

  it('returns no project or lead totals to a billing-only administrator', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ memberRole: 'billing_admin' }),
    );
    vi.mocked(orgsService.getCapabilities).mockResolvedValue({
      billing: true,
      manageMembers: false,
      changeMemberRoles: false,
      transferOwnership: false,
      writeProjects: false,
      submitProjects: false,
      archiveProjects: false,
      deleteProjects: false,
      leadScope: 'none',
      analyticsScope: 'billing',
      editOrganization: false,
      manageVerification: false,
    });

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.projects).toEqual({ total: 0, published: 0, inReview: 0, draft: 0 });
    expect(result.leads).toEqual({ total: 0, new: 0 });
    expect(dashboardRepository.countProjectsByStatus).not.toHaveBeenCalled();
    expect(leadsService.countForOrganization).not.toHaveBeenCalled();
  });

  it('does not admit a platform admin through an organization membership', async () => {
    await expect(
      dashboardService.getProfileDashboard({ ...input, userRole: 'admin' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(dashboardRepository.findProfileContext).not.toHaveBeenCalled();
  });

  it('limits member dashboard totals to their own projects and assigned leads', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ memberId: 'member_7', memberRole: 'member' }),
    );
    vi.mocked(orgsService.getCapabilities).mockResolvedValue({
      billing: false,
      manageMembers: false,
      changeMemberRoles: false,
      transferOwnership: false,
      writeProjects: true,
      submitProjects: true,
      archiveProjects: true,
      deleteProjects: false,
      leadScope: 'assigned',
      analyticsScope: 'own',
      editOrganization: false,
      manageVerification: false,
    });

    await dashboardService.getProfileDashboard(input);

    expect(dashboardRepository.countProjectsByStatus).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'member_7',
    );
    expect(leadsService.countForOrganization).toHaveBeenCalledWith('org_1', 'team_1', ['member_7']);
  });

  it('reports the current verification status without creating an application', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ verificationStatus: 'pending' }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.verificationStatus).toBe('pending');
  });

  it('reports an approved verification as expired after its expiry date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00.000Z'));
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({
        verificationStatus: 'verified',
        verificationExpiresAt: new Date('2026-09-16T12:00:00.000Z'),
      }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.verificationStatus).toBe('expired');
  });

  // E-278: publiclyVisible mirrors the owner PortfolioResponse / public route rule.
  it('reports publiclyVisible=true for an active profile with the public link on', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ profileStatus: 'active', publicLinkEnabled: true }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.publiclyVisible).toBe(true);
  });

  it('treats a missing portfolio row as incomplete even when the profile is active', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ profileStatus: 'active', publicLinkEnabled: null }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.publiclyVisible).toBe(false);
  });

  it.each<[string, Partial<DashboardProfileContext>]>([
    ['logo', { logoImageId: null }],
    ['display name', { displayName: '   ' }],
    ['tagline', { tagline: null }],
    ['bio', { bio: null }],
  ])(
    'reports publiclyVisible=false for an active profile missing its required %s',
    async (_field, overrides) => {
      vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(profile(overrides));

      const result = await dashboardService.getProfileDashboard(input);

      expect(result.publiclyVisible).toBe(false);
    },
  );

  it('reports publiclyVisible=false for a draft (incomplete) profile even with the link on', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ profileStatus: 'draft', publicLinkEnabled: true }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.publiclyVisible).toBe(false);
  });

  it('reports publiclyVisible=false for an active profile with the public link off', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ profileStatus: 'active', publicLinkEnabled: false }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.publiclyVisible).toBe(false);
  });

  it('falls back to the organization slug before a custom portfolio slug is set', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ portfolioSlug: null }),
    );

    const result = await dashboardService.getProfileDashboard(input);

    expect(result.shareUrl).toBe(new URL('/d/studio-noir', config.PUBLIC_WEB_URL).toString());
  });

  it('resolves completion against the same active organization as the dashboard context', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(
      profile({ orgId: 'org_2' }),
    );

    await dashboardService.getProfileDashboard({
      userId: 'user_1',
      userRole: 'designer',
      orgId: 'org_2',
    });

    expect(profilesService.getCompletion).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_2',
      teamId: 'team_1',
    });
  });

  it('rejects a missing active organization before querying dashboard data', async () => {
    await expect(
      dashboardService.getProfileDashboard({ userId: 'user_1', userRole: 'designer', orgId: null }),
    ).rejects.toMatchObject({ status: 422 });
    expect(dashboardRepository.findProfileContext).not.toHaveBeenCalled();
  });

  it('requires a designer profile', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(null);

    await expect(dashboardService.getProfileDashboard(input)).rejects.toBeInstanceOf(AppError);
    await expect(dashboardService.getProfileDashboard(input)).rejects.toMatchObject({
      status: 403,
    });
  });
});
