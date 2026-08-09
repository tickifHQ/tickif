import {
  ACCOUNT_STATUS,
  PLATFORM_ROLE,
  type AccountStatus,
  type PlatformRole,
  type UpsertVisitorProfileInput,
  type VisitorProfileResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
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
  if (caller.isBanned || caller.role !== PLATFORM_ROLE.VISITOR || !hasActiveLifecycle) {
    throw AppError.forbidden('Visitor profile access is not permitted');
  }
}

function toResponse(row: VisitorProfileRecord): VisitorProfileResponse {
  return {
    address: row.address,
    whatsappNumber: row.whatsappNumber,
    onboardingCompletedAt: row.onboardingCompletedAt.toISOString(),
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
    return toResponse(await visitorsRepository.upsertCompleted(caller.userId, input));
  },
};
