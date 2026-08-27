import { and, asc, desc, eq, inArray, lt, max, sql } from 'drizzle-orm';
import { db, schema } from '@repo/db';
import type { OwnershipTransferStatus } from '@repo/contracts';

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

export type OwnershipTransferRecord = typeof schema.ownershipTransferRequest.$inferSelect;

export const OWNERSHIP_TRANSFER_RESULT = {
  NOT_FOUND: 'not_found',
  NOT_PENDING: 'not_pending',
  EXPIRED: 'expired',
  FORBIDDEN: 'forbidden',
  INVALID_TARGET: 'invalid_target',
  OWNER_STATE_CHANGED: 'owner_state_changed',
} as const;

export const orgsRepository = {
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

  async findSoleOrganizationForUser(userId: string): Promise<string | null> {
    const rows = await db
      .selectDistinct({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), eq(schema.member.frozen, false)))
      .limit(2);
    return rows.length === 1 ? (rows[0]?.organizationId ?? null) : null;
  },

  async findMembershipRole(
    userId: string,
    organizationId: string,
  ): Promise<{ role: string; frozen: boolean } | null> {
    const [row] = await db
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

  async findOrganizationPlan(organizationId: string) {
    const [row] = await db
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

  async freezeMembersToLimit(input: {
    organizationId: string;
    activeLimit: number;
    now: Date;
  }): Promise<string[]> {
    if (input.activeLimit < 0) return [];

    return db.transaction(async (tx) => {
      const activeMembers = await tx
        .select({ id: schema.member.id, role: schema.member.role })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, input.organizationId),
            eq(schema.member.frozen, false),
          ),
        )
        .orderBy(desc(schema.member.createdAt), desc(schema.member.id))
        .for('update');
      const freezeCount = Math.max(0, activeMembers.length - input.activeLimit);
      const ids = activeMembers
        .filter(({ role }) => role !== 'owner')
        .slice(0, freezeCount)
        .map(({ id }) => id);
      if (ids.length === 0) return [];

      const [rankRow] = await tx
        .select({ rank: max(schema.member.freezeRank) })
        .from(schema.member)
        .where(eq(schema.member.organizationId, input.organizationId));
      const startingRank = (rankRow?.rank ?? 0) + 1;
      for (const [index, id] of ids.entries()) {
        await tx
          .update(schema.member)
          .set({ frozen: true, frozenAt: input.now, freezeRank: startingRank + index })
          .where(and(eq(schema.member.id, id), eq(schema.member.frozen, false)));
      }
      return ids;
    });
  },

  async restoreMembersToLimit(input: {
    organizationId: string;
    activeLimit: number;
  }): Promise<string[]> {
    return db.transaction(async (tx) => {
      const [activeRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, input.organizationId),
            eq(schema.member.frozen, false),
          ),
        );
      const capacity =
        input.activeLimit < 0
          ? Number.MAX_SAFE_INTEGER
          : Math.max(0, input.activeLimit - (activeRow?.count ?? 0));
      if (capacity === 0) return [];

      const frozenMembers = await tx
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, input.organizationId),
            eq(schema.member.frozen, true),
          ),
        )
        .orderBy(asc(schema.member.freezeRank), asc(schema.member.id))
        .limit(capacity)
        .for('update');
      const ids = frozenMembers.map(({ id }) => id);
      if (ids.length === 0) return [];

      await tx
        .update(schema.member)
        .set({ frozen: false, frozenAt: null, freezeRank: null })
        .where(inArray(schema.member.id, ids));
      return ids;
    });
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
    const rows = await db
      .update(schema.invitation)
      .set({ status: 'expired' })
      .where(and(eq(schema.invitation.status, 'pending'), lt(schema.invitation.expiresAt, now)))
      .returning({ id: schema.invitation.id });
    return rows.map(({ id }) => id);
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
      .where(
        and(
          eq(schema.member.id, memberId),
          eq(schema.member.organizationId, organizationId),
        ),
      )
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
      if (input.action === 'accept') {
        await tx
          .select({ id: schema.organization.id })
          .from(schema.organization)
          .where(eq(schema.organization.id, request.organizationId))
          .for('update');
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
        } else if (
          owners.length !== 1 ||
          !owner ||
          owner.userId !== request.initiatorUserId
        ) {
          return OWNERSHIP_TRANSFER_RESULT.OWNER_STATE_CHANGED;
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
        return OWNERSHIP_TRANSFER_RESULT.INVALID_TARGET;
      }
      return resolved!;
    });
  },

  async expireOwnershipTransfers(now: Date): Promise<string[]> {
    return db.transaction(async (tx) => {
      const rows = await tx
        .update(schema.ownershipTransferRequest)
        .set({ status: 'expired', resolvedAt: now, updatedAt: now })
        .where(
          and(
            eq(schema.ownershipTransferRequest.status, 'pending'),
            lt(schema.ownershipTransferRequest.expiresAt, now),
          ),
        )
        .returning({
          id: schema.ownershipTransferRequest.id,
          initiatorUserId: schema.ownershipTransferRequest.initiatorUserId,
        });
      if (rows.length > 0) {
        await tx.insert(schema.ownershipTransferAuditEvent).values(
          rows.map((row) => ({
            transferId: row.id,
            status: 'expired' as const,
            actorUserId: row.initiatorUserId,
            createdAt: now,
          })),
        );
      }
      return rows.map(({ id }) => id);
    });
  },
};
