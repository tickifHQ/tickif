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
      profilesService.getCompletion(input),
      dashboardRepository.countProjectsByStatus(profile.profileId),
    ]);

    return {
      profileCompletion: {
        score: completion.score,
        missing: completion.missing,
      },
      projects: {
        total: counts.reduce((sum, count) => sum + count.count, 0),
        published: countProjectBucket(counts, ['published']),
        inReview: countProjectBucket(counts, ['submitted', 'in_review']),
        draft: countProjectBucket(counts, ['draft', 'changes_requested']),
      },
      leads: {
        total: 0,
        new: 0,
      },
      shareUrl: shareUrl(profile.orgSlug),
    };
  },
};
