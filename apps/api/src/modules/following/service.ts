import type {
  DiscoveryFeedQuery,
  DiscoveryFeedResponse,
  FollowingList,
  FollowingQuery,
  FollowingSeen,
  FollowingState,
} from '@repo/contracts';
import { presignDownload } from '@repo/storage';
import { AppError } from '../../lib/errors.js';
import { followingRepository } from './repository.js';
import { getPortfolioPublicationState } from '../profiles/portfolio-service.js';
import { discoveryService } from '../discovery/service.js';

async function eligible(userId: string, designerProfileId: string) {
  const result = await followingRepository.eligibility(userId, designerProfileId);
  if (!result) throw AppError.notFound('Studio not found');
  if (result.ownStudio) throw AppError.forbidden('You cannot follow your own studio');
}

export const followingService = {
  async feed(userId: string, query: DiscoveryFeedQuery): Promise<DiscoveryFeedResponse> {
    return discoveryService.getFollowingFeed(userId, query);
  },
  async state(userId: string, designerProfileId: string): Promise<FollowingState> {
    await eligible(userId, designerProfileId);
    return {
      designerProfileId,
      following: await followingRepository.state(userId, designerProfileId),
    };
  },
  async follow(userId: string, designerProfileId: string): Promise<FollowingState> {
    await eligible(userId, designerProfileId);
    if (!(await followingRepository.follow(userId, designerProfileId)))
      throw AppError.notFound('Studio not found');
    return { designerProfileId, following: true };
  },
  async remove(userId: string, designerProfileId: string): Promise<FollowingState> {
    await followingRepository.remove(userId, designerProfileId);
    return { designerProfileId, following: false };
  },
  async seen(
    userId: string,
    designerProfileId: string,
    input: FollowingSeen,
  ): Promise<FollowingState> {
    await followingRepository.seen(userId, designerProfileId, new Date(input.seenThrough));
    return {
      designerProfileId,
      following: await followingRepository.state(userId, designerProfileId),
    };
  },
  async list(userId: string, query: FollowingQuery): Promise<FollowingList> {
    const result = await followingRepository.list(
      userId,
      query.limit,
      (query.page - 1) * query.limit,
    );
    const keys = [
      ...new Set(result.items.flatMap((row) => (row.logoImageId ? [row.logoImageId] : []))),
    ];
    const urls = new Map(
      await Promise.all(
        keys.map(async (key) => [key, await presignDownload({ key }).catch(() => null)] as const),
      ),
    );
    return {
      ...query,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
      items: result.items.map(({ logoImageId, followedAt, profile, portfolio, ...row }) => ({
        ...row,
        portfolioAvailable:
          !!portfolio && getPortfolioPublicationState(profile, portfolio).publiclyVisible,
        followedAt: followedAt.toISOString(),
        logoUrl: logoImageId ? (urls.get(logoImageId) ?? null) : null,
      })),
    };
  },
};
