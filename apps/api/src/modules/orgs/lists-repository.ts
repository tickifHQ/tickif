import { and, asc, desc, eq, exists, ilike, ne, notExists, or, sql, type SQL } from 'drizzle-orm';
import { db, schema, type DbTransaction } from '@repo/db';
import type { OrganizationListQuery } from '@repo/contracts';

function literalSearch(q: string) {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}

async function pageRows<T>(
  query: OrganizationListQuery,
  count: (tx: DbTransaction) => Promise<number>,
  rows: (tx: DbTransaction, offset: number) => Promise<T[]>,
) {
  return db.transaction(
    async (tx) => {
      const total = await count(tx);
      const totalPages = Math.max(1, Math.ceil(total / query.limit));
      const page = Math.min(query.page, totalPages);
      return {
        items: await rows(tx, (page - 1) * query.limit),
        total,
        totalPages,
        page,
        limit: query.limit,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}

function visibleBranch(userId: string, organizationId: string, includeAll: boolean) {
  return and(
    eq(schema.team.organizationId, organizationId),
    includeAll
      ? undefined
      : exists(
          db
            .select({ id: schema.teamMember.id })
            .from(schema.teamMember)
            .where(
              and(
                eq(schema.teamMember.teamId, schema.team.id),
                eq(schema.teamMember.userId, userId),
              ),
            ),
        ),
  );
}

const branchColumns = {
  id: schema.team.id,
  name: schema.team.name,
  createdAt: schema.team.createdAt,
  frozen: schema.team.frozen,
  frozenAt: schema.team.frozenAt,
  freezeRank: schema.team.freezeRank,
  profileId: schema.designerProfile.id,
  profileSlug: schema.designerProfile.slug,
  profileStatus: schema.designerProfile.status,
  projectCount: schema.designerProfile.projectCount,
  averageRating: schema.designerProfile.avgRating,
  reviewCount: schema.designerProfile.reviewCount,
  memberCount: sql<number>`(select count(*)::int from team_member tm inner join member m on m.user_id = tm.user_id and m.organization_id = ${schema.team.organizationId} where tm.team_id = ${schema.team.id})`,
};
const memberColumns = {
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
};
const memberRoleOrder = sql`case ${schema.member.role} when 'owner' then 0 when 'admin' then 1 when 'billing_admin' then 2 when 'member' then 3 else 4 end`;
const displayNameOrder = sql`lower(coalesce(nullif(trim(${schema.user.name}), ''), ${schema.user.email}))`;

export const organizationListsRepository = {
  async branches(input: {
    userId: string;
    organizationId: string;
    includeAll: boolean;
    query: OrganizationListQuery;
    removalTargetFor?: string;
  }) {
    const { query } = input;
    const where = and(
      visibleBranch(input.userId, input.organizationId, input.includeAll),
      query.q ? ilike(schema.team.name, literalSearch(query.q)) : undefined,
      input.removalTargetFor
        ? and(
            ne(schema.team.id, input.removalTargetFor),
            eq(schema.team.frozen, false),
            eq(schema.designerProfile.status, 'active'),
          )
        : undefined,
    );
    return pageRows(
      query,
      async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.team)
          .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
          .where(where);
        return row?.count ?? 0;
      },
      (tx, offset) =>
        tx
          .select(branchColumns)
          .from(schema.team)
          .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
          .where(where)
          .orderBy(asc(schema.team.createdAt), asc(schema.team.id))
          .limit(query.limit)
          .offset(offset),
    );
  },

  async branch(input: {
    userId: string;
    organizationId: string;
    includeAll: boolean;
    branchId: string;
  }) {
    const [row] = await db
      .select(branchColumns)
      .from(schema.team)
      .innerJoin(schema.designerProfile, eq(schema.designerProfile.teamId, schema.team.id))
      .where(
        and(
          visibleBranch(input.userId, input.organizationId, input.includeAll),
          eq(schema.team.id, input.branchId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async members(input: {
    organizationId: string;
    userId: string;
    query: OrganizationListQuery;
    branchId?: string;
    availableForBranchId?: string;
    transferEligible?: boolean;
  }) {
    const { query } = input;
    const assignment = (branchId: string) =>
      db
        .select({ id: schema.teamMember.id })
        .from(schema.teamMember)
        .where(
          and(
            eq(schema.teamMember.userId, schema.member.userId),
            eq(schema.teamMember.teamId, branchId),
          ),
        );
    const conditions: Array<SQL | undefined> = [
      eq(schema.member.organizationId, input.organizationId),
      query.q
        ? or(
            ilike(schema.user.name, literalSearch(query.q)),
            ilike(schema.user.email, literalSearch(query.q)),
          )
        : undefined,
    ];
    if (input.branchId) conditions.push(exists(assignment(input.branchId)));
    if (input.availableForBranchId)
      conditions.push(
        eq(schema.member.frozen, false),
        notExists(assignment(input.availableForBranchId)),
      );
    if (input.transferEligible)
      conditions.push(
        eq(schema.member.frozen, false),
        ne(schema.member.userId, input.userId),
        or(eq(schema.member.role, 'admin'), eq(schema.member.role, 'member')),
      );
    const where = and(...conditions);
    return pageRows(
      query,
      async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
          .where(where);
        return row?.count ?? 0;
      },
      (tx, offset) =>
        tx
          .select(memberColumns)
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
          .where(where)
          .orderBy(memberRoleOrder, displayNameOrder, asc(schema.member.id))
          .limit(query.limit)
          .offset(offset),
    );
  },

  async invitations(organizationId: string, query: OrganizationListQuery) {
    const where = and(
      eq(schema.invitation.organizationId, organizationId),
      query.q ? ilike(schema.invitation.email, literalSearch(query.q)) : undefined,
    );
    return pageRows(
      query,
      async (tx) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.invitation)
          .where(where);
        return row?.count ?? 0;
      },
      (tx, offset) =>
        tx
          .select({
            id: schema.invitation.id,
            email: schema.invitation.email,
            role: schema.invitation.role,
            status: schema.invitation.status,
            createdAt: schema.invitation.createdAt,
            expiresAt: schema.invitation.expiresAt,
          })
          .from(schema.invitation)
          .where(where)
          .orderBy(desc(schema.invitation.createdAt), asc(schema.invitation.id))
          .limit(query.limit)
          .offset(offset),
    );
  },

  async summary(organizationId: string, userId: string) {
    const [members] = await db
      .select({
        ownerCount: sql<number>`count(*) filter (where ${schema.member.role} = 'owner')::int`,
        currentUserMemberId: sql<string>`max(case when ${schema.member.userId} = ${userId} then ${schema.member.id} end)`,
      })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organizationId));
    const [invites] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.status, 'pending'),
          sql`${schema.invitation.expiresAt} > now()`,
        ),
      );
    return {
      ownerCount: members?.ownerCount ?? 0,
      currentUserMemberId: members?.currentUserMemberId ?? undefined,
      pendingInvitationCount: invites?.count ?? 0,
    };
  },
};
