import { and, db, desc, eq, schema, sql } from '@repo/db';
import type { EnquiryStatus } from '@repo/contracts';

export type EnquiryRecord = typeof schema.enquiry.$inferSelect;

export type EnquiryViewRecord = EnquiryRecord & {
  designerDisplayName: string;
  designerLogoImageId: string | null;
  designerAddress: string | null;
  referredProjectTitle: string | null;
};

export type CreateEnquiryParams = {
  requesterId: string;
  requesterName: string;
  requesterPhoneNumber: string;
  designerProfileId: string;
  referredProjectId?: string | null;
  subject: string;
  description: string;
  templateUsed?: string | null;
  budget: string;
  timeline?: string | null;
};

export type ListEnquiriesParams = {
  requesterId: string;
  status?: EnquiryStatus;
  limit: number;
  offset: number;
};

export type DesignerEligibility = {
  isOwnStudio: boolean;
};

export type CreateEnquiryWithLeadResult =
  | { kind: 'created'; enquiry: EnquiryViewRecord }
  | { kind: 'designer_not_found' }
  | { kind: 'own_studio' }
  | { kind: 'existing_enquiry'; enquiryId: string };

function enquiryViewQuery() {
  return db
    .select({
      id: schema.enquiry.id,
      requesterId: schema.enquiry.requesterId,
      designerProfileId: schema.enquiry.designerProfileId,
      organizationId: schema.enquiry.organizationId,
      referredProjectId: schema.enquiry.referredProjectId,
      subject: schema.enquiry.subject,
      description: schema.enquiry.description,
      templateUsed: schema.enquiry.templateUsed,
      budget: schema.enquiry.budget,
      timeline: schema.enquiry.timeline,
      status: schema.enquiry.status,
      leadId: schema.enquiry.leadId,
      createdAt: schema.enquiry.createdAt,
      updatedAt: schema.enquiry.updatedAt,
      designerDisplayName: schema.designerProfile.displayName,
      designerLogoImageId: schema.designerProfile.logoImageId,
      designerAddress: schema.designerProfile.address,
      referredProjectTitle: schema.project.title,
    })
    .from(schema.enquiry)
    .innerJoin(
      schema.designerProfile,
      eq(schema.enquiry.designerProfileId, schema.designerProfile.id),
    )
    .leftJoin(schema.project, eq(schema.enquiry.referredProjectId, schema.project.id));
}

export const enquiriesRepository = {
  async findById(id: string): Promise<EnquiryViewRecord | null> {
    const [row] = await enquiryViewQuery().where(eq(schema.enquiry.id, id)).limit(1);
    return row ?? null;
  },

  async findOpenByRequesterAndDesigner(
    requesterId: string,
    designerProfileId: string,
  ): Promise<{ id: string } | null> {
    const [row] = await db
      .select({ id: schema.enquiry.id })
      .from(schema.enquiry)
      .where(
        and(
          eq(schema.enquiry.requesterId, requesterId),
          eq(schema.enquiry.designerProfileId, designerProfileId),
          eq(schema.enquiry.status, 'open'),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async findDesignerEligibility(
    designerProfileId: string,
    requesterId: string,
  ): Promise<DesignerEligibility | null> {
    const [designer] = await db
      .select({
        creatorUserId: schema.designerProfile.userId,
        memberUserId: schema.member.userId,
      })
      .from(schema.designerProfile)
      .leftJoin(
        schema.member,
        and(
          eq(schema.member.organizationId, schema.designerProfile.orgId),
          eq(schema.member.userId, requesterId),
        ),
      )
      .where(
        and(
          eq(schema.designerProfile.id, designerProfileId),
          eq(schema.designerProfile.status, 'active'),
        ),
      )
      .limit(1);

    if (!designer) return null;
    return {
      isOwnStudio: designer.creatorUserId === requesterId || designer.memberUserId === requesterId,
    };
  },

  async list(params: ListEnquiriesParams): Promise<{ items: EnquiryViewRecord[]; total: number }> {
    const filters = [
      eq(schema.enquiry.requesterId, params.requesterId),
      params.status ? eq(schema.enquiry.status, params.status) : undefined,
    ].filter((f) => f !== undefined);
    const where = and(...filters);

    const [items, [count]] = await Promise.all([
      enquiryViewQuery()
        .where(where)
        .orderBy(desc(schema.enquiry.createdAt), desc(schema.enquiry.id))
        .limit(params.limit)
        .offset(params.offset),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(schema.enquiry)
        .where(where),
    ]);

    return { items, total: count?.value ?? 0 };
  },

  async createWithLead(params: CreateEnquiryParams): Promise<CreateEnquiryWithLeadResult> {
    const result = await db.transaction(async (tx) => {
      const [designer] = await tx
        .select({
          organizationId: schema.designerProfile.orgId,
          creatorUserId: schema.designerProfile.userId,
          memberUserId: schema.member.userId,
        })
        .from(schema.designerProfile)
        .leftJoin(
          schema.member,
          and(
            eq(schema.member.organizationId, schema.designerProfile.orgId),
            eq(schema.member.userId, params.requesterId),
          ),
        )
        .where(
          and(
            eq(schema.designerProfile.id, params.designerProfileId),
            eq(schema.designerProfile.status, 'active'),
          ),
        )
        .limit(1);
      if (!designer) return { kind: 'designer_not_found' } as const;
      if (
        designer.creatorUserId === params.requesterId ||
        designer.memberUserId === params.requesterId
      ) {
        return { kind: 'own_studio' } as const;
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${params.requesterId}:${params.designerProfileId}`}, 0))`,
      );

      const [existing] = await tx
        .select({ id: schema.enquiry.id })
        .from(schema.enquiry)
        .where(
          and(
            eq(schema.enquiry.requesterId, params.requesterId),
            eq(schema.enquiry.designerProfileId, params.designerProfileId),
            eq(schema.enquiry.status, 'open'),
          ),
        )
        .limit(1);
      if (existing) {
        return { kind: 'existing_enquiry', enquiryId: existing.id } as const;
      }

      const [lead] = await tx
        .insert(schema.lead)
        .values({
          organizationId: designer.organizationId,
          referredProjectId: params.referredProjectId ?? null,
          name: params.requesterName,
          contactNumber: params.requesterPhoneNumber,
          budgetBandSlug: params.budget,
          message: `[${params.subject}] ${params.description}`,
          source: 'enquiry',
        })
        .returning({ id: schema.lead.id });
      if (!lead) throw new Error('lead insert returned no row');

      const [enquiry] = await tx
        .insert(schema.enquiry)
        .values({
          requesterId: params.requesterId,
          designerProfileId: params.designerProfileId,
          organizationId: designer.organizationId,
          referredProjectId: params.referredProjectId ?? null,
          subject: params.subject,
          description: params.description,
          templateUsed: params.templateUsed ?? null,
          budget: params.budget,
          timeline: params.timeline ?? null,
          leadId: lead.id,
        })
        .returning({ id: schema.enquiry.id });
      if (!enquiry) throw new Error('enquiry insert returned no row');
      return { kind: 'created', enquiryId: enquiry.id } as const;
    });

    if (result.kind !== 'created') return result;
    const enquiry = await this.findById(result.enquiryId);
    if (!enquiry) throw new Error('inserted enquiry not found');
    return { kind: 'created', enquiry };
  },
};
