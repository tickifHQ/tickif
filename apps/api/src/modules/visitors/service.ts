import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  type AccountStatus,
  type PlatformRole,
  type UpsertVisitorProfileInput,
  type VisitorProfileResponse,
  type VisitorFeedPreferences,
  type VisitorFeedPreferencesResponse,
  visitorFeedFilters,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { VisitorProfileAccessDeniedError, VisitorProfileConstraintError } from './errors.js';
import {
  visitorsRepository,
  type VisitorProfileRecord,
  type VisitorProfileUpdate,
} from './repository.js';
import { taxonomyService } from '../taxonomy/service.js';

export type VisitorCaller = {
  userId: string;
  role: PlatformRole;
  status: AccountStatus;
  isBanned: boolean;
};

function assertEligibleVisitor(caller: VisitorCaller): void {
  const hasActiveLifecycle =
    caller.status === ACCOUNT_STATUS.PENDING || caller.status === ACCOUNT_STATUS.ACTIVE;
  if (caller.isBanned || caller.role !== PLATFORM_ROLE.VISITOR || !hasActiveLifecycle) {
    throw AppError.forbidden('Visitor profile access is not permitted');
  }
}

function toResponse(row: VisitorProfileRecord): VisitorProfileResponse {
  return {
    address: row.address,
    whatsappNumber: row.whatsappNumber,
    onboardingCompletedAt: row.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFeedPreferencesResponse(
  preferences: VisitorFeedPreferences | null,
): VisitorFeedPreferencesResponse {
  return {
    preferences,
    filters: visitorFeedFilters(preferences),
  };
}

async function saveCompletedProfile(
  userId: string,
  input: VisitorProfileUpdate,
): Promise<VisitorProfileRecord> {
  try {
    return await visitorsRepository.upsertCompleted(userId, input);
  } catch (error) {
    if (error instanceof VisitorProfileAccessDeniedError) {
      throw AppError.forbidden('Visitor profile access is not permitted');
    }
    if (error instanceof VisitorProfileConstraintError) {
      throw AppError.unprocessable('Invalid visitor onboarding profile');
    }
    throw error;
  }
}

export const visitorsService = {
  async getMine(caller: VisitorCaller): Promise<VisitorProfileResponse> {
    assertEligibleVisitor(caller);
    const profile = await visitorsRepository.findByUserId(caller.userId);
    if (!profile) throw AppError.notFound('Visitor profile not found');
    return toResponse(profile);
  },

  async upsertMine(
    input: UpsertVisitorProfileInput,
    caller: VisitorCaller,
  ): Promise<VisitorProfileResponse> {
    assertEligibleVisitor(caller);
    return toResponse(await saveCompletedProfile(caller.userId, input));
  },

  async getFeedPreferences(caller: VisitorCaller): Promise<VisitorFeedPreferencesResponse> {
    assertEligibleVisitor(caller);
    const profile = await visitorsRepository.findByUserId(caller.userId);
    return toFeedPreferencesResponse(profile?.feedPreferences ?? null);
  },

  async saveFeedPreferences(
    input: VisitorFeedPreferences,
    caller: VisitorCaller,
  ): Promise<VisitorFeedPreferencesResponse> {
    assertEligibleVisitor(caller);
    if (input.citySlug !== null) {
      const { terms: cities } = await taxonomyService.list('city', undefined);
      const city = cities.find((term) => term.slug === input.citySlug);
      if (!city) throw AppError.unprocessable('Invalid citySlug');
      if (input.localitySlug !== null) {
        const { terms: localities } = await taxonomyService.list('locality', city.id);
        if (!localities.some((term) => term.slug === input.localitySlug)) {
          throw AppError.unprocessable('Invalid localitySlug for this city');
        }
      }
    }
    const profile = await saveCompletedProfile(caller.userId, { feedPreferences: input });
    return toFeedPreferencesResponse(profile.feedPreferences);
  },
};
