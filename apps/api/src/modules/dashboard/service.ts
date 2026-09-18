import {
  ORGANIZATION_ACCESS_SCOPE,
  VERIFICATION_APPLICATION_STATUS,
  VERIFICATION_EFFECTIVE_STATUS,
  type ProfileDashboardResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { leadsService } from '../leads/service.js';
import { getPortfolioPublicationState, publicPortfolioUrl } from '../profiles/portfolio-service.js';
import { profilesService } from '../profiles/service.js';
import { orgsService } from '../orgs/service.js';
import {
  dashboardRepository,
  type DashboardProfileContext,
  type ProjectStatusCount,
} from './repository.js';

type OverviewInput = {
  userId: string;
  userRole: string;
  orgId: string | null;
  teamId?: string | null;
};

function countProjectBucket(
  counts: ProjectStatusCount[],
  statuses: ProjectStatusCount['status'][],
): number {
  return counts
    .filter((count) => statuses.includes(count.status))
    .reduce((sum, count) => sum + count.count, 0);
}

function effectiveVerificationStatus(
  profile: Pick<DashboardProfileContext, 'verificationStatus' | 'verificationExpiresAt'>,
  now = new Date(),
): ProfileDashboardResponse['verificationStatus'] {
  if (
    profile.verificationStatus === VERIFICATION_APPLICATION_STATUS.VERIFIED &&
    profile.verificationExpiresAt &&
    profile.verificationExpiresAt <= now
  ) {
    return VERIFICATION_EFFECTIVE_STATUS.EXPIRED;
  }
  return profile.verificationStatus;
}

export const dashboardService = {
  async getProfileDashboard(input: OverviewInput): Promise<ProfileDashboardResponse> {
    if (input.userRole !== 'designer') {
      throw AppError.forbidden('Designer role required');
    }
    if (!input.orgId) {
      throw AppError.unprocessable('No active organization selected');
    }
    const profile = await dashboardRepository.findProfileContext({
      userId: input.userId,
      orgId: input.orgId,
      teamId: input.teamId,
    });
    if (!profile) {
      throw AppError.forbidden('Designer profile required');
    }

    const capabilities = await orgsService.getCapabilities(input.userId, profile.orgId);
    if (!capabilities) {
      throw AppError.forbidden('Active organization membership required');
    }

    const canReadProjects =
      capabilities.analyticsScope !== ORGANIZATION_ACCESS_SCOPE.NONE &&
      capabilities.analyticsScope !== ORGANIZATION_ACCESS_SCOPE.BILLING;
    const responsibleMemberId =
      capabilities.analyticsScope === ORGANIZATION_ACCESS_SCOPE.OWN ? profile.memberId : undefined;
    const leadCountsRequest = (() => {
      if (capabilities.leadScope === ORGANIZATION_ACCESS_SCOPE.FULL) {
        return leadsService.countForOrganization(profile.orgId, profile.teamId);
      }
      if (capabilities.leadScope === ORGANIZATION_ACCESS_SCOPE.ASSIGNED) {
        return leadsService.countForOrganization(profile.orgId, profile.teamId, [profile.memberId]);
      }
      return Promise.resolve({ total: 0, new: 0 });
    })();

    const [completion, counts, leadCounts] = await Promise.all([
      profilesService.getCompletion({
        userId: input.userId,
        orgId: profile.orgId,
        teamId: profile.teamId,
      }),
      canReadProjects
        ? responsibleMemberId
          ? dashboardRepository.countProjectsByStatus(profile.profileId, responsibleMemberId)
          : dashboardRepository.countProjectsByStatus(profile.profileId)
        : Promise.resolve([]),
      leadCountsRequest,
    ]);

    const published = countProjectBucket(counts, ['published']);
    const inReview = countProjectBucket(counts, ['submitted', 'in_review']);
    const draft = countProjectBucket(counts, ['draft', 'changes_requested']);
    const publication = getPortfolioPublicationState(
      {
        status: profile.profileStatus,
        logoImageId: profile.logoImageId,
        displayName: profile.displayName,
        bio: profile.bio,
      },
      profile.publicLinkEnabled === null
        ? null
        : { publicLinkEnabled: profile.publicLinkEnabled, tagline: profile.tagline },
    );

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
        total: leadCounts.total,
        new: leadCounts.new,
      },
      shareUrl: publicPortfolioUrl(profile.portfolioSlug, profile.profileSlug),
      publiclyVisible: publication.publiclyVisible,
      verificationStatus: effectiveVerificationStatus(profile),
    };
  },
};
