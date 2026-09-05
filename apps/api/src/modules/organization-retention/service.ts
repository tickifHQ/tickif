import type {
  OrganizationRetentionMutationResponse,
  OrganizationRetentionResponse,
  PermanentlyEraseOrganizationResponse,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  organizationRetentionRepository,
  type OrganizationRetentionRecord,
  type RetentionMutationResult,
} from './repository.js';

function retentionState(row: OrganizationRetentionRecord) {
  return {
    organizationId: row.organizationId,
    status: row.status,
    requestedAt: row.requestedAt.toISOString(),
    archiveDueAt: row.archiveDueAt.toISOString(),
    hardDeleteDueAt: row.hardDeleteDueAt.toISOString(),
    delistWindowDays: row.delistWindowDays,
    archiveWindowDays: row.archiveWindowDays,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    purgeRequestedAt: row.purgeRequestedAt?.toISOString() ?? null,
    purgingAt: row.purgingAt?.toISOString() ?? null,
    erasedAt: row.erasedAt?.toISOString() ?? null,
    holdPlacedAt: row.holdPlacedAt?.toISOString() ?? null,
    holdReason: row.holdReason,
    revision: row.revision,
  };
}

function unwrapMutation(result: RetentionMutationResult): OrganizationRetentionMutationResponse {
  switch (result.outcome) {
    case 'updated':
      return { retention: result.retention ? retentionState(result.retention) : null };
    case 'organization_not_found':
      throw AppError.notFound('Organization not found');
    case 'forbidden':
      throw AppError.forbidden('Only the organization Owner can manage its retention lifecycle');
    case 'confirmation_mismatch':
      throw AppError.unprocessable('Organization slug confirmation does not match');
    case 'not_recoverable':
      throw AppError.conflict('Organization is no longer recoverable through this action');
    case 'legal_hold':
      throw AppError.conflict('Organization is under a legal hold');
  }
}

export const organizationRetentionService = {
  async getForOwner(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationRetentionResponse> {
    const result = await organizationRetentionRepository.findForOwner(input);
    if (result === 'organization_not_found') throw AppError.notFound('Organization not found');
    if (result === 'forbidden') {
      throw AppError.forbidden('Only the organization Owner can view its retention lifecycle');
    }
    return { retention: result ? retentionState(result) : null };
  },

  async getForSuperadmin(organizationId: string): Promise<OrganizationRetentionResponse> {
    const retention = await organizationRetentionRepository.findByOrganization(organizationId);
    if (retention === 'organization_not_found') throw AppError.notFound('Organization not found');
    return { retention: retention ? retentionState(retention) : null };
  },

  async requestDeletion(input: {
    organizationId: string;
    userId: string;
    confirmationSlug: string;
    now?: Date;
  }): Promise<OrganizationRetentionMutationResponse> {
    return unwrapMutation(
      await organizationRetentionRepository.requestDeletion({
        ...input,
        now: input.now ?? new Date(),
      }),
    );
  },

  async restoreForOwner(input: {
    organizationId: string;
    userId: string;
    now?: Date;
  }): Promise<OrganizationRetentionMutationResponse> {
    return unwrapMutation(
      await organizationRetentionRepository.restore({
        ...input,
        allowArchived: false,
        now: input.now ?? new Date(),
      }),
    );
  },

  async restoreArchived(input: {
    organizationId: string;
    actorUserId: string;
    now?: Date;
  }): Promise<OrganizationRetentionMutationResponse> {
    return unwrapMutation(
      await organizationRetentionRepository.restore({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        allowArchived: true,
        now: input.now ?? new Date(),
      }),
    );
  },

  async placeHold(input: {
    organizationId: string;
    actorUserId: string;
    reason: string;
    now?: Date;
  }): Promise<OrganizationRetentionMutationResponse> {
    return unwrapMutation(
      await organizationRetentionRepository.setLegalHold({
        ...input,
        hold: true,
        now: input.now ?? new Date(),
      }),
    );
  },

  async releaseHold(input: {
    organizationId: string;
    actorUserId: string;
    now?: Date;
  }): Promise<OrganizationRetentionMutationResponse> {
    return unwrapMutation(
      await organizationRetentionRepository.setLegalHold({
        ...input,
        reason: null,
        hold: false,
        now: input.now ?? new Date(),
      }),
    );
  },

  async requestPermanentErasure(input: {
    organizationId: string;
    userId: string;
    confirmationSlug: string;
    now?: Date;
  }): Promise<PermanentlyEraseOrganizationResponse> {
    unwrapMutation(
      await organizationRetentionRepository.requestPermanentErasure({
        ...input,
        now: input.now ?? new Date(),
      }),
    );
    return { organizationId: input.organizationId, accepted: true };
  },
};
