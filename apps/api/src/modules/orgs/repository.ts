import { and, asc, desc, eq, gt, inArray, max, sql } from 'drizzle-orm';
import { db, schema } from '@repo/db';

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
  'id' | 'email' | 'role' | 'createdAt' | 'expiresAt'
>;

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

  async listPendingInvitations(organizationId: string): Promise<OrganizationInvitationRecord[]> {
    return db
      .select({
        id: schema.invitation.id,
        email: schema.invitation.email,
        role: schema.invitation.role,
        createdAt: schema.invitation.createdAt,
        expiresAt: schema.invitation.expiresAt,
      })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.status, 'pending'),
          gt(schema.invitation.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.invitation.createdAt));
  },
};
