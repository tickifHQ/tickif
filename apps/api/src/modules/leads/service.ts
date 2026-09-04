import type {
  CreateLeadInput,
  LeadCountsQuery,
  LeadCountsResponse,
  LeadDetailResponse,
  LeadListItem,
  LeadStatus,
  ListLeadsQuery,
  ListLeadsResponse,
  UpdateLeadInput,
} from '@repo/contracts';
import { ORGANIZATION_ACCESS_SCOPE } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { orgsService } from '../orgs/service.js';
import {
  leadsRepository,
  type LeadDetailRecord,
  type LeadListRecord,
  type LeadStatusCount,
} from './repository.js';

export type Caller = {
  userId: string;
  isBanned: boolean;
  activeOrgId: string | null;
  activeTeamId?: string | null;
};

export type LeadCounts = {
  total: number;
  new: number;
};

function toListItem(row: LeadListRecord): LeadListItem {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    referredProjectTitle: row.referredProjectTitle,
    contactNumber: row.contactNumber,
    budgetBand: row.budgetBandSlug,
    assignedMemberId: row.assignedMemberId,
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
  };
}

function toDetail(row: LeadDetailRecord): LeadDetailResponse {
  return {
    ...toListItem(row),
    referredProjectId: row.referredProjectId,
    message: row.message,
    notes: row.notes,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function listStatus(status: ListLeadsQuery['status']): LeadStatus | undefined {
  return status === 'all' ? undefined : status;
}

function countLeadBucket(counts: LeadStatusCount[], status: LeadStatus): number {
  return counts
    .filter((count) => count.status === status)
    .reduce((sum, count) => sum + count.count, 0);
}

function toCounts(counts: LeadStatusCount[]): LeadCountsResponse {
  return {
    total: counts.reduce((sum, count) => sum + count.count, 0),
    new: countLeadBucket(counts, 'new'),
    contacted: countLeadBucket(counts, 'contacted'),
    closed: countLeadBucket(counts, 'closed'),
    spam: countLeadBucket(counts, 'spam'),
  };
}

type LeadAccess =
  | { scope: typeof ORGANIZATION_ACCESS_SCOPE.FULL }
  | { scope: typeof ORGANIZATION_ACCESS_SCOPE.ASSIGNED; memberIds: string[] };

async function resolveLeadAccess(userId: string, organizationId: string): Promise<LeadAccess> {
  const capabilities = await orgsService.getCapabilities(userId, organizationId);
  if (capabilities?.leadScope === ORGANIZATION_ACCESS_SCOPE.FULL) {
    return { scope: ORGANIZATION_ACCESS_SCOPE.FULL };
  }
  if (capabilities?.leadScope === ORGANIZATION_ACCESS_SCOPE.ASSIGNED) {
    const memberIds = await leadsRepository.findActiveMemberIds(userId, organizationId);
    if (memberIds.length > 0) return { scope: ORGANIZATION_ACCESS_SCOPE.ASSIGNED, memberIds };
  }
  throw AppError.forbidden();
}

async function assertFullLeadAccess(userId: string, organizationId: string): Promise<void> {
  const access = await resolveLeadAccess(userId, organizationId);
  if (access.scope !== ORGANIZATION_ACCESS_SCOPE.FULL) {
    throw AppError.forbidden();
  }
}

function requireActiveOrganization(caller: Caller): string {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  return caller.activeOrgId;
}

function requireActiveTeam(caller: Caller): string {
  const teamId = caller.activeTeamId;
  if (!teamId) throw AppError.unprocessable('No active branch selected');
  return teamId;
}

async function assertLeadAccess(
  caller: Caller,
  lead: Pick<LeadDetailRecord, 'organizationId' | 'teamId' | 'assignedMemberId'>,
): Promise<LeadAccess> {
  const activeOrganizationId = requireActiveOrganization(caller);
  if (lead.organizationId !== activeOrganizationId) {
    throw AppError.notFound('Lead not found');
  }
  if (caller.activeTeamId && lead.teamId !== caller.activeTeamId) {
    throw AppError.notFound('Lead not found');
  }
  const access = await resolveLeadAccess(caller.userId, activeOrganizationId);
  if (
    access.scope === ORGANIZATION_ACCESS_SCOPE.ASSIGNED &&
    (!lead.assignedMemberId || !access.memberIds.includes(lead.assignedMemberId))
  ) {
    throw AppError.notFound('Lead not found');
  }
  return access;
}

async function resolveTargetOrganization(
  input: Pick<CreateLeadInput, 'organizationId'>,
  caller: Caller,
): Promise<string> {
  const activeOrganizationId = requireActiveOrganization(caller);
  if (input.organizationId && input.organizationId !== activeOrganizationId) {
    throw AppError.forbidden('Lead organization must match the active organization');
  }
  await assertFullLeadAccess(caller.userId, activeOrganizationId);
  return activeOrganizationId;
}

export const leadsService = {
  async list(query: ListLeadsQuery, caller: Caller): Promise<ListLeadsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrganizationId = requireActiveOrganization(caller);
    const activeTeamId = caller.activeTeamId ?? null;
    const access = await resolveLeadAccess(caller.userId, activeOrganizationId);
    const limit = query.limit;
    const page = query.page;
    const { items, total } = await leadsRepository.list({
      userId: caller.userId,
      activeOrgId: activeOrganizationId,
      activeTeamId,
      ...(access.scope === ORGANIZATION_ACCESS_SCOPE.ASSIGNED
        ? { assignedMemberIds: access.memberIds }
        : {}),
      status: listStatus(query.status),
      q: query.q,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: items.map(toListItem),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  },

  async getById(id: string, caller: Caller): Promise<LeadDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const row = await leadsRepository.findById(id);
    if (!row) throw AppError.notFound('Lead not found');
    await assertLeadAccess(caller, row);
    return toDetail(row);
  },

  async counts(query: LeadCountsQuery, caller: Caller): Promise<LeadCountsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrganizationId = requireActiveOrganization(caller);
    const activeTeamId = caller.activeTeamId ?? null;
    const access = await resolveLeadAccess(caller.userId, activeOrganizationId);
    return toCounts(
      await leadsRepository.countByStatus(
        activeOrganizationId,
        query.q,
        activeTeamId ?? undefined,
        access.scope === ORGANIZATION_ACCESS_SCOPE.ASSIGNED ? access.memberIds : undefined,
      ),
    );
  },

  async update(id: string, input: UpdateLeadInput, caller: Caller): Promise<LeadDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const existing = await leadsRepository.findById(id);
    if (!existing) throw AppError.notFound('Lead not found');
    const access = await assertLeadAccess(caller, existing);
    if (access.scope !== ORGANIZATION_ACCESS_SCOPE.FULL) throw AppError.forbidden();

    const row = await leadsRepository.update(id, existing.organizationId, input);
    if (row === 'invalid_assignee') {
      throw AppError.unprocessable(
        'assignedMemberId must reference an active member of the organization',
      );
    }
    if (!row) throw AppError.notFound('Lead not found');
    return toDetail(row);
  },

  async create(input: CreateLeadInput, caller: Caller): Promise<LeadDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const organizationId = await resolveTargetOrganization(input, caller);
    const teamId = requireActiveTeam(caller);

    if (input.budgetBandSlug && !(await leadsRepository.budgetBandExists(input.budgetBandSlug))) {
      throw AppError.unprocessable('Invalid budgetBandSlug');
    }

    if (input.referredProjectId) {
      const projectBranch = await leadsRepository.findProjectBranch(input.referredProjectId);
      if (
        !projectBranch ||
        projectBranch.organizationId !== organizationId ||
        projectBranch.teamId !== teamId
      ) {
        throw AppError.unprocessable('referredProjectId must belong to the active branch');
      }
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : undefined;
    return toDetail(await leadsRepository.create({ ...input, organizationId, teamId, receivedAt }));
  },

  async countForOrganization(organizationId: string, teamId?: string): Promise<LeadCounts> {
    const counts = toCounts(await leadsRepository.countByStatus(organizationId, undefined, teamId));
    return {
      total: counts.total,
      new: counts.new,
    };
  },
};
