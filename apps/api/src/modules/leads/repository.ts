import { ilike } from 'drizzle-orm';
import { db, schema, eq, and, or, desc, sql } from '@repo/db';
import type { CreateLeadInput, LeadStatus } from '@repo/contracts';

export type LeadRecord = typeof schema.lead.$inferSelect;

export type LeadListRecord = Pick<
  LeadRecord,
  'id' | 'name' | 'contactNumber' | 'budgetBandSlug' | 'status' | 'receivedAt'
> & {
  city: string | null;
  referredProjectTitle: string | null;
};

export type LeadDetailRecord = LeadListRecord &
  Pick<
    LeadRecord,
    'organizationId' | 'referredProjectId' | 'message' | 'source' | 'createdAt' | 'updatedAt'
  >;

export type LeadStatusCount = {
  status: LeadStatus;
  count: number;
};

export type ListLeadsParams = {
  userId: string;
  activeOrgId: string;
  status?: LeadStatus;
  q?: string;
  limit: number;
  offset: number;
};

export type CreateLeadParams = Omit<CreateLeadInput, 'receivedAt'> & {
  organizationId: string;
  receivedAt?: Date;
};

function leadProjection() {
  return {
    id: schema.lead.id,
    organizationId: schema.lead.organizationId,
    referredProjectId: schema.lead.referredProjectId,
    name: schema.lead.name,
    contactNumber: schema.lead.contactNumber,
    budgetBandSlug: schema.lead.budgetBandSlug,
    message: schema.lead.message,
    source: schema.lead.source,
    status: schema.lead.status,
    receivedAt: schema.lead.receivedAt,
    createdAt: schema.lead.createdAt,
    updatedAt: schema.lead.updatedAt,
    city: schema.project.citySlug,
    referredProjectTitle: schema.project.title,
  };
}

export const leadsRepository = {
  async list(params: ListLeadsParams): Promise<{ items: LeadListRecord[]; total: number }> {
    const filters = [
      sql<boolean>`exists (
        select 1 from ${schema.member}
        where ${schema.member.organizationId} = ${schema.lead.organizationId}
          and ${schema.member.userId} = ${params.userId}
      )`,
      eq(schema.lead.organizationId, params.activeOrgId),
      params.status ? eq(schema.lead.status, params.status) : undefined,
      params.q
        ? or(
            ilike(schema.lead.name, `%${params.q}%`),
            ilike(schema.project.title, `%${params.q}%`),
          )
        : undefined,
    ].filter((filter) => filter !== undefined);
    const where = and(...filters);

    const [items, [count]] = await Promise.all([
      db
        .select({
          id: schema.lead.id,
          name: schema.lead.name,
          contactNumber: schema.lead.contactNumber,
          budgetBandSlug: schema.lead.budgetBandSlug,
          status: schema.lead.status,
          receivedAt: schema.lead.receivedAt,
          city: schema.project.citySlug,
          referredProjectTitle: schema.project.title,
        })
        .from(schema.lead)
        .leftJoin(schema.project, eq(schema.lead.referredProjectId, schema.project.id))
        .where(where)
        .orderBy(desc(schema.lead.receivedAt))
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

  async updateStatus(id: string, status: LeadStatus): Promise<LeadDetailRecord | null> {
    const [row] = await db
      .update(schema.lead)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.lead.id, id))
      .returning({ id: schema.lead.id });
    if (!row) return null;
    return this.findById(row.id);
  },

  async create(input: CreateLeadParams): Promise<LeadDetailRecord> {
    const [row] = await db
      .insert(schema.lead)
      .values({
        organizationId: input.organizationId,
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

  async isOrgMember(userId: string, organizationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)))
      .limit(1);
    return !!row;
  },

  async findProjectOrganization(projectId: string): Promise<string | null> {
    const [row] = await db
      .select({ organizationId: schema.designerProfile.orgId })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .where(eq(schema.project.id, projectId))
      .limit(1);
    return row?.organizationId ?? null;
  },

  async budgetBandExists(slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'budget_band'), eq(schema.taxonomy.slug, slug)))
      .limit(1);
    return !!row;
  },

  async countByStatus(organizationId: string): Promise<LeadStatusCount[]> {
    return db
      .select({
        status: schema.lead.status,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, organizationId))
      .groupBy(schema.lead.status);
  },
};
