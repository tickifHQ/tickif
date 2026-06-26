import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileCompletionResponse } from '@repo/contracts';
import { AppError } from '../../../src/lib/errors.js';
import type {
  DashboardProfileContext,
  DashboardProjectSummary,
  ProjectStatusCount,
} from '../../../src/modules/dashboard/repository.js';

vi.mock('../../../src/modules/dashboard/repository.js', () => ({
  dashboardRepository: {
    findProfileContext: vi.fn(),
    listRecentProjects: vi.fn(),
    countProjectsByStatus: vi.fn(),
    incrementShareCount: vi.fn(),
  },
}));

vi.mock('../../../src/modules/profiles/service.js', () => ({
  profilesService: {
    getCompletion: vi.fn(),
  },
}));

const { dashboardService } = await import('../../../src/modules/dashboard/service.js');
const { dashboardRepository } = await import('../../../src/modules/dashboard/repository.js');
const { profilesService } = await import('../../../src/modules/profiles/service.js');

const input = { userId: 'user_1', orgId: 'org_1' };

const profile = (overrides: Partial<DashboardProfileContext> = {}): DashboardProfileContext => ({
  profileId: '11111111-1111-4111-8111-111111111111',
  orgId: 'org_1',
  orgSlug: 'studio-noir',
  displayName: 'Studio Noir',
  location: 'Indiranagar, Bangalore',
  logoImageId: null,
  status: 'draft',
  projectCount: 1,
  shareCount: 0,
  avgRating: '0',
  reviewCount: 0,
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

const project = (
  overrides: Partial<DashboardProjectSummary> = {},
): DashboardProjectSummary => ({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Maitri Apartments - 2BHK luxury in Bangalore',
  status: 'submitted',
  submittedAt: new Date('2026-06-20T10:00:00.000Z'),
  updatedAt: new Date('2026-06-20T10:00:00.000Z'),
  ...overrides,
});

const counts = (items: ProjectStatusCount[] = [{ status: 'submitted', count: 1 }]) => items;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(profile());
  vi.mocked(dashboardRepository.listRecentProjects).mockResolvedValue([project()]);
  vi.mocked(dashboardRepository.countProjectsByStatus).mockResolvedValue(counts());
  vi.mocked(profilesService.getCompletion).mockResolvedValue(completion());
});

describe('dashboardService.getOverview', () => {
  it('returns the Figma overview aggregate without KYC state', async () => {
    const result = await dashboardService.getOverview(input);

    expect(result.header.title).toBe('Welcome, Studio Noir');
    expect(result.profileCompletion.score).toBe(67);
    expect(result.projectReview).toMatchObject({
      status: 'pending_review',
      title: 'We review your project',
      sla: '24-48 hours',
    });
    expect(result.actions.map((action) => action.key)).toEqual([
      'project-review',
      'complete-profile',
    ]);
    expect(result.portfolio).toMatchObject({
      publicPath: '/d/studio-noir',
      copyText: 'tickif.in/d/studio-noir',
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain('kyc');
  });

  it('surfaces changes requested as an attention state', async () => {
    vi.mocked(dashboardRepository.listRecentProjects).mockResolvedValue([
      project({ status: 'changes_requested', submittedAt: null }),
    ]);
    vi.mocked(dashboardRepository.countProjectsByStatus).mockResolvedValue(
      counts([{ status: 'changes_requested', count: 1 }]),
    );

    const result = await dashboardService.getOverview(input);

    expect(result.projectReview.status).toBe('changes_requested');
    expect(result.actions[0]).toMatchObject({
      key: 'project-review',
      status: 'attention',
    });
  });

  it('requires a designer profile', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(null);

    await expect(dashboardService.getOverview(input)).rejects.toBeInstanceOf(AppError);
    await expect(dashboardService.getOverview(input)).rejects.toMatchObject({ status: 403 });
  });
});

describe('dashboardService.getProfileDashboard', () => {
  it('returns the Linear E-140 dashboard summary contract', async () => {
    vi.mocked(dashboardRepository.countProjectsByStatus).mockResolvedValue([
      { status: 'published', count: 4 },
      { status: 'submitted', count: 1 },
      { status: 'in_review', count: 2 },
      { status: 'draft', count: 3 },
      { status: 'changes_requested', count: 2 },
    ]);

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
        total: 0,
        new: 0,
      },
      shareUrl: 'https://tickif.com/d/studio-noir',
    });
  });
});

describe('dashboardService.recordPortfolioShare', () => {
  it('increments and returns the copy-link payload', async () => {
    vi.mocked(dashboardRepository.incrementShareCount).mockResolvedValue(3);

    const result = await dashboardService.recordPortfolioShare(input);

    expect(result).toEqual({
      publicPath: '/d/studio-noir',
      copyText: 'tickif.in/d/studio-noir',
      shareCount: 3,
    });
  });
});
