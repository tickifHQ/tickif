import type {
  OrganizationListQuery,
  OrganizationBranchesPageResponse,
  OrganizationBranchMembersPageResponse,
  OrganizationMembersPageResponse,
  OrganizationInvitationsPageResponse,
} from '@repo/contracts';
import { branchLimit } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { orgsRepository } from './repository.js';
import { orgsService, normalizeRole, accountDisplayName, invitationState } from './service.js';
import { organizationListsRepository as repository } from './lists-repository.js';

type Actor = { userId: string; organizationId: string };

async function access(actor: Actor) {
  const member = await orgsRepository.findMembershipRole(actor.userId, actor.organizationId);
  if (!member || member.frozen) throw AppError.forbidden('Active organization membership required');
  return { ...actor, includeAll: member.role === 'owner' || member.role === 'admin' };
}
async function manage(actor: Actor) {
  const permissions = await orgsService.getCapabilities(actor.userId, actor.organizationId);
  if (!permissions?.manageMembers)
    throw AppError.forbidden('Organization member management required');
}
async function visibleBranch(actor: Actor, branchId: string) {
  const branch = await repository.branch({ ...(await access(actor)), branchId });
  if (!branch) throw AppError.notFound('Branch not found');
  return branch;
}
async function serializeBranches(rows: Awaited<ReturnType<typeof repository.branches>>['items']) {
  const footprints = await orgsRepository.listBranchFootprints(rows.map((row) => row.profileId));
  return rows.map((row) => ({
    ...row,
    averageRating: Number(row.averageRating) || 0,
    frozenAt: row.frozenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    footprint: footprints
      .filter((item) => item.profileId === row.profileId)
      .map(({ id, kind, slug, label }) => ({ id, kind, slug, label })),
    members: [],
  }));
}

export const organizationListsService = {
  async branches(
    actor: Actor & { activeTeamId: string | null },
    query: OrganizationListQuery & { removalTargetFor?: string },
  ): Promise<OrganizationBranchesPageResponse> {
    const permissions = await access(actor);
    if (query.removalTargetFor) await visibleBranch(actor, query.removalTargetFor);
    const [result, plan, branchUsage] = await Promise.all([
      repository.branches({ ...permissions, query, removalTargetFor: query.removalTargetFor }),
      orgsRepository.findOrganizationPlan(actor.organizationId),
      orgsRepository.countActiveBranches(actor.organizationId),
    ]);
    return {
      ...result,
      items: await serializeBranches(result.items),
      activeTeamId: actor.activeTeamId,
      branchUsage,
      branchLimit: branchLimit(plan.tier, plan.state),
    };
  },
  async branch(actor: Actor, branchId: string) {
    const row = await visibleBranch(actor, branchId);
    return (await serializeBranches([row]))[0]!;
  },
  async members(
    actor: Actor,
    query: OrganizationListQuery & {
      availableForBranchId?: string;
      transferEligible?: 'true' | 'false';
    },
  ): Promise<OrganizationMembersPageResponse> {
    await access(actor);
    if (query.availableForBranchId) {
      await manage(actor);
      const branch = await visibleBranch(actor, query.availableForBranchId);
      if (branch.frozen) throw AppError.forbidden('Frozen branches cannot be changed');
    }
    if (query.transferEligible === 'true') {
      const capabilities = await orgsService.getCapabilities(actor.userId, actor.organizationId);
      if (!capabilities?.transferOwnership)
        throw AppError.forbidden('Ownership transfer access required');
    }
    const result = await repository.members({
      ...actor,
      query,
      availableForBranchId: query.availableForBranchId,
      transferEligible: query.transferEligible === 'true',
    });
    return {
      ...result,
      items: result.items.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: accountDisplayName(member.name, member.email),
        email: member.email,
        image: member.image,
        role: normalizeRole(member.role),
        frozen: member.frozen,
        frozenAt: member.frozenAt?.toISOString() ?? null,
        freezeRank: member.freezeRank,
        joinedAt: member.createdAt.toISOString(),
        isCurrentUser: member.userId === actor.userId,
      })),
    };
  },
  async branchMembers(
    actor: Actor,
    branchId: string,
    query: OrganizationListQuery,
  ): Promise<OrganizationBranchMembersPageResponse> {
    await visibleBranch(actor, branchId);
    const result = await repository.members({ ...actor, query, branchId });
    return {
      ...result,
      items: result.items.map((member) => ({
        userId: member.userId,
        name: accountDisplayName(member.name, member.email),
        email: member.email,
        image: member.image,
        role: normalizeRole(member.role),
        frozen: member.frozen,
      })),
    };
  },
  async invitations(
    actor: Actor,
    query: OrganizationListQuery,
  ): Promise<OrganizationInvitationsPageResponse> {
    await access(actor);
    await manage(actor);
    const result = await repository.invitations(actor.organizationId, query);
    const now = new Date();
    return {
      ...result,
      items: result.items.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: normalizeRole(invitation.role),
        state: invitationState(
          invitation.status === 'pending' && invitation.expiresAt <= now
            ? 'expired'
            : invitation.status,
        ),
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    };
  },
  async summary(actor: Actor) {
    const workspace = await orgsService.getCurrentWorkspace({
      userId: actor.userId,
      activeOrgId: actor.organizationId,
      includeLists: false,
    });
    const counts = await repository.summary(actor.organizationId, actor.userId);
    return {
      ...workspace,
      ...counts,
      pendingInvitationCount: workspace.canManage ? counts.pendingInvitationCount : 0,
    };
  },
};
