import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileCompletionResponse } from '@repo/contracts';
import { AppError } from '../../../src/lib/errors.js';
import type {
  DashboardProfileContext,
  ProjectStatusCount,
} from '../../../src/modules/dashboard/repository.js';

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

const { dashboardService } = await import('../../../src/modules/dashboard/service.js');
const { dashboardRepository } = await import('../../../src/modules/dashboard/repository.js');
const { profilesService } = await import('../../../src/modules/profiles/service.js');

const input = { userId: 'user_1', orgId: 'org_1' };

const profile = (overrides: Partial<DashboardProfileContext> = {}): DashboardProfileContext => ({
  profileId: '11111111-1111-4111-8111-111111111111',
  orgId: 'org_1',
  orgSlug: 'studio-noir',
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

  it('resolves completion against the same organization as the dashboard context', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(profile({ orgId: 'org_2' }));

    await dashboardService.getProfileDashboard({ userId: 'user_1', orgId: null });

    expect(profilesService.getCompletion).toHaveBeenCalledWith({
      userId: 'user_1',
      orgId: 'org_2',
    });
  });

  it('requires a designer profile', async () => {
    vi.mocked(dashboardRepository.findProfileContext).mockResolvedValue(null);

    await expect(dashboardService.getProfileDashboard(input)).rejects.toBeInstanceOf(AppError);
    await expect(dashboardService.getProfileDashboard(input)).rejects.toMatchObject({ status: 403 });
  });
});
