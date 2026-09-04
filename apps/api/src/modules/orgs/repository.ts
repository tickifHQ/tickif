import { and, asc, desc, eq, inArray, lte, max, sql } from 'drizzle-orm';
import {
  db,
  schema,
  expirePendingInvitations,
  expirePendingOwnershipTransfers,
  freezeMembersToLimitOnTx,
  restoreMembersToLimitOnTx,
  selectMemberIdsToFreeze,
} from '@repo/db';
import type { DbTransaction } from '@repo/db';
import type { ActiveContext, OwnershipTransferStatus } from '@repo/contracts';

export type OrganizationSummaryRecord = Pick<
  typeof schema.organization.$inferSelect,
  'id' | 'name' | 'slug' | 'logo'
>;

export type OrganizationMemberRecord = Pick<
  typeof schema.member.$inferSelect,
  'id' | 'userId' | 'role' | 'frozen' | 'frozenAt' | 'freezeRank' | 'createdAt'
> &
  Pick<typeof schema.user.$inferSelect, 'name' | 'email' | 'image'>;

export type OrganizationInvitationRecord = Pick<
  typeof schema.invitation.$inferSelect,
  'id' | 'email' | 'role' | 'status' | 'createdAt' | 'expiresAt'
>;

export { selectMemberIdsToFreeze };
export type { DbTransaction };

export type OwnershipTransferRecord = typeof schema.ownershipTransferRequest.$inferSelect;

export const OWNERSHIP_TRANSFER_RESULT = {
  NOT_FOUND: 'not_found',
  NOT_PENDING: 'not_pending',
  EXPIRED: 'expired',
  FORBIDDEN: 'forbidden',
  INVALID_TARGET: 'invalid_target',
  OWNER_STATE_CHANGED: 'owner_state_changed',
  RETENTION_ACTIVE: 'retention_active',
} as const;

export const orgsRepository = {
  async hasActiveRetention(
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<boolean> {
    const executor = tx ?? db;
    const [row] = await executor
      .select({ organizationId: schema.organizationRetention.organizationId })
      .from(schema.organizationRetention)
      .where(eq(schema.organizationRetention.organizationId, organizationId))
      .limit(1);
    return !!row;
  },

  async isValidOrganizationContext(
    userId: string,
    organizationId: string,
    teamId: string,
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .innerJoin(
        schema.team,
        and(
          eq(schema.team.id, teamId),
          eq(schema.team.organizationId, schema.member.organizationId),
        ),
      )
      .innerJoin(
        schema.teamMember,
        and(eq(schema.teamMember.teamId, teamId), eq(schema.teamMember.userId, userId)),
      )
      .where(
        and(
          eq(schema.member.userId, userId),
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.frozen, false),
          eq(schema.team.frozen, false),
        ),
      )
      .limit(1);
    return !!row;
  },

  async saveContextPreference(userId: string, context: ActiveContext): Promise<void> {
    const values =
      context.kind === 'personal'
        ? { userId, contextKind: context.kind, organizationId: null, teamId: null }
        : {
            userId,
            contextKind: context.kind,
            organizationId: context.organizationId,
            teamId: context.teamId,
          };
    await db
      .insert(schema.userContextPreference)
      .values(values)
      .onConflictDoUpdate({
        target: schema.userContextPreference.userId,
        set: { ...values, updatedAt: new Date() },
      });
  },

  async hasMembership(userId: string, organizationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, userId),
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.frozen, false),
        ),
      )
      .limit(1);
    return !!row;
  },

  async findDefaultActiveTeamForUser(
    userId: string,
    organizationId: string,
  ): Promise<string | null> {
    const [row] = await db
      .select({ teamId: schema.team.id })
      .from(schema.team)
      .innerJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
      .where(
        and(
          eq(schema.team.organizationId, organizationId),
          eq(schema.teamMember.userId, userId),
          eq(schema.team.frozen, false),
        ),
      )
      .orderBy(asc(schema.team.createdAt), asc(schema.team.id))
      .limit(1);
    return row?.teamId ?? null;
  },

  async findMembershipRole(
    userId: string,
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<{ role: string; frozen: boolean } | null> {
    const executor = tx ?? db;
    const [row] = await executor
      .select({ role: schema.member.role, frozen: schema.member.frozen })
      .from(schema.member)
      .where(
        and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
      )
      .limit(1);
    return row ?? null;
  },

  async findWorkspaceMembership(
    userId: string,
    organizationId: string,
  ): Promise<{ organization: OrganizationSummaryRecord; role: string; frozen: boolean } | null> {
    const [row] = await db
      .select({
        organization: {
          id: schema.organization.id,
          name: schema.organization.name,
          slug: schema.organization.slug,
          logo: schema.organization.logo,
        },
        role: schema.member.role,
        frozen: schema.member.frozen,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
      .where(
        and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
      )
      .limit(1);
    return row ?? null;
  },

  async listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    return db
      .select({
        id: schema.member.id,
        userId: schema.member.userId,
        role: schema.member.role,
        frozen: schema.member.frozen,
        frozenAt: schema.member.frozenAt,
        freezeRank: schema.member.freezeRank,
        createdAt: schema.member.createdAt,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.organizationId, organizationId));
  },

  async findOrganizationPlan(organizationId: string, tx?: DbTransaction) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({
        tier: schema.subscription.planTier,
        state: schema.subscription.subscriptionState,
      })
      .from(schema.subscription)
      .where(eq(schema.subscription.organizationId, organizationId))
      .limit(1);
    return row ?? { tier: 'hobby' as const, state: 'active' as const };
  },

  async countActiveMembers(organizationId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.member)
      .where(
        and(eq(schema.member.organizationId, organizationId), eq(schema.member.frozen, false)),
      );
    return row?.count ?? 0;
  },

  async listActiveBranchesForUser(userId: string, organizationId: string) {
    return db
      .select({
        id: schema.team.id,
        name: schema.team.name,
        createdAt: schema.team.createdAt,
        profileId: schema.designerProfile.id,
        profileSlug: schema.designerProfile.slug,
        projectCount: schema.designerProfile.projectCount,
      })
      .from(schema.team)
      .innerJoin(schema.teamMember, eq(schema.teamMember.teamId, schema.team.id))
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(
        and(
          eq(schema.team.organizationId, organizationId),
          eq(schema.teamMember.userId, userId),
          eq(schema.team.frozen, false),
        ),
      )
      .orderBy(asc(schema.team.createdAt), asc(schema.team.id));
  },

  async listBranchMembers(teamIds: string[]) {
    if (teamIds.length === 0) return [];
    return db
      .select({
        teamId: schema.teamMember.teamId,
        userId: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        image: schema.user.image,
        role: schema.member.role,
      })
      .from(schema.teamMember)
      .innerJoin(schema.team, eq(schema.teamMember.teamId, schema.team.id))
      .innerJoin(schema.user, eq(schema.teamMember.userId, schema.user.id))
      .innerJoin(
        schema.member,
        and(
          eq(schema.member.organizationId, schema.team.organizationId),
          eq(schema.member.userId, schema.teamMember.userId),
        ),
      )
      .where(inArray(schema.teamMember.teamId, teamIds));
  },

  async countActiveBranches(organizationId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.team)
      .where(and(eq(schema.team.organizationId, organizationId), eq(schema.team.frozen, false)));
    return row?.count ?? 0;
  },

  async freezeBranchesToLimit(input: {
    organizationId: string;
    activeLimit: number;
    now: Date;
    tx?: DbTransaction;
  }): Promise<string[]> {
    if (input.activeLimit < 0) return [];
    const run = async (tx: DbTransaction) => {
      const activeBranches = await tx
        .select({ id: schema.team.id })
        .from(schema.team)
        .where(
          and(eq(schema.team.organizationId, input.organizationId), eq(schema.team.frozen, false)),
        )
        .orderBy(desc(schema.team.createdAt), desc(schema.team.id))
        .for('update');
      const ids = activeBranches
        .slice(0, Math.max(0, activeBranches.length - input.activeLimit))
        .map(({ id }) => id);
      if (ids.length === 0) return [];
      const [rankRow] = await tx
        .select({ rank: max(schema.team.freezeRank) })
        .from(schema.team)
        .where(eq(schema.team.organizationId, input.organizationId));
      const startingRank = (rankRow?.rank ?? 0) + 1;
      for (const [index, id] of ids.entries()) {
        await tx
          .update(schema.team)
          .set({ frozen: true, frozenAt: input.now, freezeRank: startingRank + index })
          .where(and(eq(schema.team.id, id), eq(schema.team.frozen, false)));
      }
      await tx
        .update(schema.session)
        .set({ activeTeamId: null })
        .where(inArray(schema.session.activeTeamId, ids));
      return ids;
    };
    return input.tx ? run(input.tx) : db.transaction(run);
  },

  async restoreBranchesToLimit(input: {
    organizationId: string;
    activeLimit: number;
    tx?: DbTransaction;
  }): Promise<string[]> {
    const run = async (tx: DbTransaction) => {
      const [activeRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.team)
        .where(
          and(eq(schema.team.organizationId, input.organizationId), eq(schema.team.frozen, false)),
        );
      const capacity =
        input.activeLimit < 0
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, input.activeLimit - (activeRow?.count ?? 0));
      if (capacity === 0) return [];
      const frozen = await tx
        .select({ id: schema.team.id })
        .from(schema.team)
        .where(
          and(eq(schema.team.organizationId, input.organizationId), eq(schema.team.frozen, true)),
        )
        .orderBy(asc(schema.team.freezeRank), asc(schema.team.id))
        .limit(capacity)
        .for('update');
      const ids = frozen.map(({ id }) => id);
      if (ids.length === 0) return [];
      await tx
        .update(schema.team)
        .set({ frozen: false, frozenAt: null, freezeRank: null })
        .where(inArray(schema.team.id, ids));
      return ids;
    };
    return input.tx ? run(input.tx) : db.transaction(run);
  },

  async freezeMembersToLimit(input: {
    organizationId: string;
    activeLimit: number;
    now: Date;
    /** Run inside a caller-provided transaction (E-239 atomic restore). */
    tx?: DbTransaction;
  }): Promise<string[]> {
    if (input.activeLimit < 0) return [];
    const run = (tx: DbTransaction) => freezeMembersToLimitOnTx(tx, input);
    return input.tx ? run(input.tx) : db.transaction(run);
  },

  async restoreMembersToLimit(input: {
    organizationId: string;
    activeLimit: number;
    /** Run inside a caller-provided transaction (E-239 atomic restore). */
    tx?: DbTransaction;
  }): Promise<string[]> {
    const run = (tx: DbTransaction) => restoreMembersToLimitOnTx(tx, input);
    return input.tx ? run(input.tx) : db.transaction(run);
  },

  async listInvitations(organizationId: string): Promise<OrganizationInvitationRecord[]> {
    return db
      .select({
        id: schema.invitation.id,
        email: schema.invitation.email,
        role: schema.invitation.role,
        status: schema.invitation.status,
        createdAt: schema.invitation.createdAt,
        expiresAt: schema.invitation.expiresAt,
      })
      .from(schema.invitation)
      .where(eq(schema.invitation.organizationId, organizationId))
      .orderBy(desc(schema.invitation.createdAt));
  },

  async expireInvitations(now: Date): Promise<string[]> {
    // Shared with the E-239 worker sweep via @repo/db so both run identical logic.
    return expirePendingInvitations(now);
  },

  async findMemberById(organizationId: string, memberId: string) {
    const [row] = await db
      .select({
        id: schema.member.id,
        userId: schema.member.userId,
        role: schema.member.role,
        frozen: schema.member.frozen,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)))
      .limit(1);
    return row ?? null;
  },

  async findUser(userId: string) {
    const [row] = await db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    return row ?? null;
  },

  async createOwnershipTransfer(input: {
    organizationId: string;
    initiatorUserId: string;
    targetUserId: string;
    targetMemberId: string;
    expiresAt: Date;
    now: Date;
  }): Promise<OwnershipTransferRecord> {
    return db.transaction(async (tx) => {
      const expired = await tx
        .update(schema.ownershipTransferRequest)
        .set({ status: 'expired', resolvedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(schema.ownershipTransferRequest.organizationId, input.organizationId),
            eq(schema.ownershipTransferRequest.status, 'pending'),
            lte(schema.ownershipTransferRequest.expiresAt, input.now),
          ),
        )
        .returning({ id: schema.ownershipTransferRequest.id });
      if (expired.length > 0) {
        await tx.insert(schema.ownershipTransferAuditEvent).values(
          expired.map(({ id }) => ({
            transferId: id,
            status: 'expired' as const,
            actorUserId: input.initiatorUserId,
            createdAt: input.now,
          })),
        );
      }

      const [request] = await tx
        .insert(schema.ownershipTransferRequest)
        .values({
          organizationId: input.organizationId,
          initiatorUserId: input.initiatorUserId,
          targetUserId: input.targetUserId,
          targetMemberId: input.targetMemberId,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning();
      await tx.insert(schema.ownershipTransferAuditEvent).values({
        transferId: request!.id,
        status: 'pending',
        actorUserId: input.initiatorUserId,
        createdAt: input.now,
      });
      return request!;
    });
  },

  async findOwnershipTransfer(id: string): Promise<OwnershipTransferRecord | null> {
    const [row] = await db
      .select()
      .from(schema.ownershipTransferRequest)
      .where(eq(schema.ownershipTransferRequest.id, id))
      .limit(1);
    return row ?? null;
  },

  async findPendingOwnershipTransfer(
    organizationId: string,
  ): Promise<OwnershipTransferRecord | null> {
    const [row] = await db
      .select()
      .from(schema.ownershipTransferRequest)
      .where(
        and(
          eq(schema.ownershipTransferRequest.organizationId, organizationId),
          eq(schema.ownershipTransferRequest.status, 'pending'),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async resolveOwnershipTransfer(input: {
    id: string;
    actorUserId: string;
    action: 'accept' | 'decline' | 'cancel';
    now: Date;
  }): Promise<
    | OwnershipTransferRecord
    | (typeof OWNERSHIP_TRANSFER_RESULT)[keyof typeof OWNERSHIP_TRANSFER_RESULT]
  > {
    return db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(schema.ownershipTransferRequest)
        .where(eq(schema.ownershipTransferRequest.id, input.id))
        .for('update')
        .limit(1);
      if (!request) return OWNERSHIP_TRANSFER_RESULT.NOT_FOUND;
      if (request.status !== 'pending') return OWNERSHIP_TRANSFER_RESULT.NOT_PENDING;
      if (request.expiresAt <= input.now) {
        const [expired] = await tx
          .update(schema.ownershipTransferRequest)
          .set({ status: 'expired', resolvedAt: input.now, updatedAt: input.now })
          .where(eq(schema.ownershipTransferRequest.id, request.id))
          .returning();
        await tx.insert(schema.ownershipTransferAuditEvent).values({
          transferId: request.id,
          status: 'expired',
          actorUserId: input.actorUserId,
          createdAt: input.now,
        });
        void expired;
        return OWNERSHIP_TRANSFER_RESULT.EXPIRED;
      }

      const expectedActor =
        input.action === 'cancel' ? request.initiatorUserId : request.targetUserId;
      if (input.actorUserId !== expectedActor) return OWNERSHIP_TRANSFER_RESULT.FORBIDDEN;

      let status: OwnershipTransferStatus =
        input.action === 'accept'
          ? 'accepted'
          : input.action === 'decline'
            ? 'declined'
            : 'cancelled';
      let ownerStateChanged = false;
      if (input.action === 'accept') {
        const [organization] = await tx
          .select({ id: schema.organization.id })
          .from(schema.organization)
          .where(eq(schema.organization.id, request.organizationId))
          .for('update');
        if (!organization) return OWNERSHIP_TRANSFER_RESULT.NOT_FOUND;
        const [retention] = await tx
          .select({ organizationId: schema.organizationRetention.organizationId })
          .from(schema.organizationRetention)
          .where(eq(schema.organizationRetention.organizationId, request.organizationId))
          .limit(1);
        if (retention) return OWNERSHIP_TRANSFER_RESULT.RETENTION_ACTIVE;
        const memberships = await tx
          .select({
            id: schema.member.id,
            userId: schema.member.userId,
            role: schema.member.role,
            frozen: schema.member.frozen,
          })
          .from(schema.member)
          .where(eq(schema.member.organizationId, request.organizationId))
          .for('update');
        const owners = memberships.filter(({ role, frozen }) => role === 'owner' && !frozen);
        const owner = owners[0];
        const target = memberships.find(
          ({ id, userId }) => id === request.targetMemberId && userId === request.targetUserId,
        );
        if (!target || target.frozen || !['admin', 'member'].includes(target.role)) {
          status = 'cancelled';
        } else if (owners.length !== 1 || !owner || owner.userId !== request.initiatorUserId) {
          status = 'cancelled';
          ownerStateChanged = true;
        } else {
          await tx
            .update(schema.member)
            .set({ role: 'admin' })
            .where(eq(schema.member.id, owner.id));
          await tx
            .update(schema.member)
            .set({ role: 'owner' })
            .where(eq(schema.member.id, target.id));
        }
      }

      const [resolved] = await tx
        .update(schema.ownershipTransferRequest)
        .set({ status, resolvedAt: input.now, updatedAt: input.now })
        .where(eq(schema.ownershipTransferRequest.id, request.id))
        .returning();
      await tx.insert(schema.ownershipTransferAuditEvent).values({
        transferId: request.id,
        status,
        actorUserId: input.actorUserId,
        createdAt: input.now,
      });
      if (input.action === 'accept' && status === 'cancelled') {
        if (ownerStateChanged) return OWNERSHIP_TRANSFER_RESULT.OWNER_STATE_CHANGED;
        return OWNERSHIP_TRANSFER_RESULT.INVALID_TARGET;
      }
      return resolved!;
    });
  },

  async expireOwnershipTransfers(now: Date): Promise<string[]> {
    // Shared with the E-239 worker sweep via @repo/db so both run identical logic.
    return expirePendingOwnershipTransfers(now);
  },
};
