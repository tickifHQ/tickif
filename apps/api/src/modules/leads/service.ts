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

async function assertOrgMember(userId: string, organizationId: string): Promise<void> {
  if (!(await orgsService.isMember(userId, organizationId))) {
    throw AppError.forbidden();
  }
}

function requireActiveOrganization(caller: Caller): string {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  return caller.activeOrgId;
}

async function assertLeadInActiveOrganization(
  caller: Caller,
  organizationId: string,
): Promise<void> {
  const activeOrganizationId = requireActiveOrganization(caller);
  if (organizationId !== activeOrganizationId) {
    throw AppError.notFound('Lead not found');
  }
  await assertOrgMember(caller.userId, activeOrganizationId);
}

async function resolveTargetOrganization(
  input: Pick<CreateLeadInput, 'organizationId'>,
  caller: Caller,
): Promise<string> {
  const activeOrganizationId = requireActiveOrganization(caller);
  if (input.organizationId && input.organizationId !== activeOrganizationId) {
    throw AppError.forbidden('Lead organization must match the active organization');
  }
  await assertOrgMember(caller.userId, activeOrganizationId);
  return activeOrganizationId;
}

export const leadsService = {
  async list(query: ListLeadsQuery, caller: Caller): Promise<ListLeadsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrganizationId = requireActiveOrganization(caller);
    await assertOrgMember(caller.userId, activeOrganizationId);
    const limit = query.limit;
    const page = query.page;
    const { items, total } = await leadsRepository.list({
      userId: caller.userId,
      activeOrgId: activeOrganizationId,
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
    await assertLeadInActiveOrganization(caller, row.organizationId);
    return toDetail(row);
  },

  async counts(query: LeadCountsQuery, caller: Caller): Promise<LeadCountsResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const activeOrganizationId = requireActiveOrganization(caller);
    await assertOrgMember(caller.userId, activeOrganizationId);
    return toCounts(await leadsRepository.countByStatus(activeOrganizationId, query.q));
  },

  async update(id: string, input: UpdateLeadInput, caller: Caller): Promise<LeadDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const existing = await leadsRepository.findById(id);
    if (!existing) throw AppError.notFound('Lead not found');
    await assertLeadInActiveOrganization(caller, existing.organizationId);

    const row = await leadsRepository.update(id, input);
    if (!row) throw AppError.notFound('Lead not found');
    return toDetail(row);
  },

  async create(input: CreateLeadInput, caller: Caller): Promise<LeadDetailResponse> {
    if (caller.isBanned) throw AppError.forbidden('Account suspended');
    const organizationId = await resolveTargetOrganization(input, caller);

    if (input.budgetBandSlug && !(await leadsRepository.budgetBandExists(input.budgetBandSlug))) {
      throw AppError.unprocessable('Invalid budgetBandSlug');
    }

    if (input.referredProjectId) {
      const projectOrgId = await leadsRepository.findProjectOrganization(input.referredProjectId);
      if (!projectOrgId || projectOrgId !== organizationId) {
        throw AppError.unprocessable('referredProjectId must belong to the organization');
      }
    }

    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : undefined;
    return toDetail(await leadsRepository.create({ ...input, organizationId, receivedAt }));
  },

  async countForOrganization(organizationId: string): Promise<LeadCounts> {
    const counts = toCounts(await leadsRepository.countByStatus(organizationId));
    return {
      total: counts.total,
      new: counts.new,
    };
  },
};
