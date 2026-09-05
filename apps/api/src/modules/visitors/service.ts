import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  type AccountStatus,
  type PlatformRole,
  type UpsertVisitorProfileInput,
  type VisitorProfileResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { VisitorProfileAccessDeniedError, VisitorProfileConstraintError } from './errors.js';
import { visitorsRepository, type VisitorProfileRecord } from './repository.js';

export type VisitorCaller = {
  userId: string;
  role: PlatformRole;
  status: AccountStatus;
  isBanned: boolean;
};

function assertEligibleVisitor(caller: VisitorCaller): void {
  const hasActiveLifecycle =
    caller.status === ACCOUNT_STATUS.PENDING || caller.status === ACCOUNT_STATUS.ACTIVE;
  const hasPersonalProfileRole =
    caller.role === PLATFORM_ROLE.VISITOR || caller.role === PLATFORM_ROLE.DESIGNER;
  if (caller.isBanned || !hasPersonalProfileRole || !hasActiveLifecycle) {
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
    try {
      return toResponse(await visitorsRepository.upsertCompleted(caller.userId, input));
    } catch (error) {
      if (error instanceof VisitorProfileAccessDeniedError) {
        throw AppError.forbidden('Visitor profile access is not permitted');
      }
      if (error instanceof VisitorProfileConstraintError) {
        throw AppError.unprocessable('Invalid visitor onboarding profile');
      }
      throw error;
    }
  },
};
