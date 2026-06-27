import type { ProfileDashboardResponse } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { profilesService } from '../profiles/service.js';
import {
  dashboardRepository,
  type ProjectStatusCount,
} from './repository.js';

const PUBLIC_SITE_ORIGIN = 'https://tickif.com';

type OverviewInput = {
  userId: string;
  orgId: string | null;
};

function shareUrl(orgSlug: string): string {
  return `${PUBLIC_SITE_ORIGIN}/d/${orgSlug}`;
}

function countProjectBucket(
  counts: ProjectStatusCount[],
  statuses: ProjectStatusCount['status'][],
): number {
  return counts
    .filter((count) => statuses.includes(count.status))
    .reduce((sum, count) => sum + count.count, 0);
}

export const dashboardService = {
  async getProfileDashboard(input: OverviewInput): Promise<ProfileDashboardResponse> {
    const profile = await dashboardRepository.findProfileContext(input);
    if (!profile) {
      throw AppError.forbidden('Designer profile required');
    }

    const [completion, counts] = await Promise.all([
      profilesService.getCompletion({ userId: input.userId, orgId: profile.orgId }),
      dashboardRepository.countProjectsByStatus(profile.profileId),
    ]);

    const published = countProjectBucket(counts, ['published']);
    const inReview = countProjectBucket(counts, ['submitted', 'in_review']);
    const draft = countProjectBucket(counts, ['draft', 'changes_requested']);

    return {
      profileCompletion: {
        score: completion.score,
        missing: completion.missing,
      },
      projects: {
        total: published + inReview + draft,
        published,
        inReview,
        draft,
      },
      leads: {
        total: 0,
        new: 0,
      },
      shareUrl: shareUrl(profile.orgSlug),
    };
  },
};
