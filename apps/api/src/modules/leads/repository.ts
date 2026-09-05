import { ilike, type SQL } from 'drizzle-orm';
import { db, schema, eq, and, or, desc, asc, inArray, sql } from '@repo/db';
import type { CreateLeadInput, LeadStatus, UpdateLeadInput } from '@repo/contracts';

export type LeadRecord = typeof schema.lead.$inferSelect;

export type LeadListRecord = Pick<
  LeadRecord,
  'id' | 'name' | 'contactNumber' | 'budgetBandSlug' | 'status' | 'receivedAt'
> & {
  assignedMemberId: string | null;
  city: string | null;
  referredProjectTitle: string | null;
};

export type LeadDetailRecord = LeadListRecord &
  Pick<
    LeadRecord,
    | 'organizationId'
    | 'teamId'
    | 'referredProjectId'
    | 'message'
    | 'notes'
    | 'source'
    | 'createdAt'
    | 'updatedAt'
  >;

export type LeadStatusCount = {
  status: LeadStatus;
  count: number;
};

export type ListLeadsParams = {
  userId: string;
  activeOrgId: string;
  activeTeamId: string | null;
  assignedMemberIds?: string[];
  status?: LeadStatus;
  q?: string;
  sortBy?: 'name' | 'receivedAt' | 'budget';
  sortOrder?: 'asc' | 'desc';
  limit: number;
  offset: number;
};

export type CreateLeadParams = Omit<CreateLeadInput, 'receivedAt'> & {
  organizationId: string;
  teamId: string;
  receivedAt?: Date;
};

export type UpdateLeadResult = LeadDetailRecord | 'invalid_assignee' | null;

function leadProjection() {
  return {
    id: schema.lead.id,
    organizationId: schema.lead.organizationId,
    teamId: schema.lead.teamId,
    referredProjectId: schema.lead.referredProjectId,
    assignedMemberId: schema.lead.assignedMemberId,
    name: schema.lead.name,
    contactNumber: schema.lead.contactNumber,
    budgetBandSlug: schema.lead.budgetBandSlug,
    message: schema.lead.message,
    notes: schema.lead.notes,
    source: schema.lead.source,
    status: schema.lead.status,
    receivedAt: schema.lead.receivedAt,
    createdAt: schema.lead.createdAt,
    updatedAt: schema.lead.updatedAt,
    city: schema.project.citySlug,
    referredProjectTitle: schema.project.title,
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function leadSearchFilter(q?: string): SQL | undefined {
  if (!q) return undefined;
  const pattern = `%${escapeLikePattern(q)}%`;
  return or(
    ilike(schema.lead.name, pattern),
    ilike(schema.lead.contactNumber, pattern),
    ilike(schema.project.title, pattern),
  );
}

export const leadsRepository = {
  async list(params: ListLeadsParams): Promise<{ items: LeadListRecord[]; total: number }> {
    const filters = [
      sql<boolean>`exists (
        select 1 from ${schema.member}
        where ${schema.member.organizationId} = ${schema.lead.organizationId}
          and ${schema.member.userId} = ${params.userId}
          and ${schema.member.frozen} = false
      )`,
      eq(schema.lead.organizationId, params.activeOrgId),
      sql<boolean>`exists (
        select 1 from ${schema.team}
        where ${schema.team.id} = ${schema.lead.teamId}
          and ${schema.team.frozen} = false
      )`,
      params.activeTeamId ? eq(schema.lead.teamId, params.activeTeamId) : undefined,
      params.assignedMemberIds
        ? inArray(schema.lead.assignedMemberId, params.assignedMemberIds)
        : undefined,
      params.status ? eq(schema.lead.status, params.status) : undefined,
      leadSearchFilter(params.q),
    ].filter((filter) => filter !== undefined);
    const where = and(...filters);

    const direction = params.sortOrder === 'asc' ? asc : desc;
    const sortColumn =
      params.sortBy === 'name'
        ? schema.lead.name
        : params.sortBy === 'budget'
          ? schema.lead.budgetBandSlug
          : schema.lead.receivedAt;

    const [items, [count]] = await Promise.all([
      db
        .select({
          id: schema.lead.id,
          name: schema.lead.name,
          contactNumber: schema.lead.contactNumber,
          budgetBandSlug: schema.lead.budgetBandSlug,
          assignedMemberId: schema.lead.assignedMemberId,
          status: schema.lead.status,
          receivedAt: schema.lead.receivedAt,
          city: schema.project.citySlug,
          referredProjectTitle: schema.project.title,
        })
        .from(schema.lead)
        .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
        .where(where)
        .orderBy(direction(sortColumn))
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.lead)
        .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
        .where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async findById(id: string): Promise<LeadDetailRecord | null> {
    const [row] = await db
      .select(leadProjection())
      .from(schema.lead)
      .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
      .where(eq(schema.lead.id, id))
      .limit(1);
    return row ?? null;
  },

  async update(
    id: string,
    organizationId: string,
    input: UpdateLeadInput,
  ): Promise<UpdateLeadResult> {
    return db.transaction(async (tx) => {
      if (input.assignedMemberId) {
        const [assignee] = await tx
          .select({ id: schema.member.id })
          .from(schema.member)
          .where(
            and(
              eq(schema.member.id, input.assignedMemberId),
              eq(schema.member.organizationId, organizationId),
              eq(schema.member.frozen, false),
            ),
          )
          .for('update')
          .limit(1);
        if (!assignee) return 'invalid_assignee';
      }

      const [row] = await tx
        .update(schema.lead)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.assignedMemberId !== undefined
            ? { assignedMemberId: input.assignedMemberId }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.lead.id, id), eq(schema.lead.organizationId, organizationId)))
        .returning({ id: schema.lead.id });
      if (!row) return null;

      const [updated] = await tx
        .select(leadProjection())
        .from(schema.lead)
        .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
        .where(eq(schema.lead.id, row.id))
        .limit(1);
      return updated ?? null;
    });
  },

  async create(input: CreateLeadParams): Promise<LeadDetailRecord> {
    const [row] = await db
      .insert(schema.lead)
      .values({
        organizationId: input.organizationId,
        teamId: input.teamId,
        referredProjectId: input.referredProjectId ?? null,
        name: input.name,
        contactNumber: input.contactNumber,
        budgetBandSlug: input.budgetBandSlug ?? null,
        message: input.message ?? null,
        source: input.source ?? 'enquiry',
        receivedAt: input.receivedAt,
      })
      .returning({ id: schema.lead.id });
    if (!row) throw new Error('insert returned no row');
    const created = await this.findById(row.id);
    if (!created) throw new Error('inserted lead not found');
    return created;
  },

  async findProjectBranch(
    projectId: string,
  ): Promise<{ organizationId: string; teamId: string } | null> {
    const [row] = await db
      .select({
        organizationId: schema.designerProfile.orgId,
        teamId: schema.designerProfile.teamId,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    return row ?? null;
  },

  async budgetBandExists(slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'budget_band'), eq(schema.taxonomy.slug, slug)))
      .limit(1);
    return !!row;
  },

  async findActiveMemberIds(userId: string, organizationId: string): Promise<string[]> {
    const rows = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.userId, userId),
          eq(schema.member.organizationId, organizationId),
          eq(schema.member.frozen, false),
        ),
      );
    return rows.map(({ id }) => id);
  },

  async countByStatus(
    organizationId: string,
    q?: string,
    teamId?: string,
    assignedMemberIds?: string[],
  ): Promise<LeadStatusCount[]> {
    const projection = {
      status: schema.lead.status,
      count: sql<number>`count(*)::int`,
    };

    if (!q) {
      return db
        .select(projection)
        .from(schema.lead)
        .where(
          and(
            eq(schema.lead.organizationId, organizationId),
            sql<boolean>`exists (
              select 1 from ${schema.team}
              where ${schema.team.id} = ${schema.lead.teamId}
                and ${schema.team.frozen} = false
            )`,
            teamId ? eq(schema.lead.teamId, teamId) : undefined,
            assignedMemberIds
              ? inArray(schema.lead.assignedMemberId, assignedMemberIds)
              : undefined,
          ),
        )
        .groupBy(schema.lead.status);
    }

    return db
      .select(projection)
      .from(schema.lead)
      .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
      .where(
        and(
          eq(schema.lead.organizationId, organizationId),
          sql<boolean>`exists (
            select 1 from ${schema.team}
            where ${schema.team.id} = ${schema.lead.teamId}
              and ${schema.team.frozen} = false
          )`,
          teamId ? eq(schema.lead.teamId, teamId) : undefined,
          assignedMemberIds ? inArray(schema.lead.assignedMemberId, assignedMemberIds) : undefined,
          leadSearchFilter(q),
        ),
      )
      .groupBy(schema.lead.status);
  },
};
