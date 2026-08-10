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
  designerProfileId: string;
  organizationId: string;
  referredProjectId?: string | null;
  subject: string;
  description: string;
  templateUsed?: string | null;
  budget: string;
  timeline?: string | null;
  leadId: string;
};

export type ListEnquiriesParams = {
  requesterId: string;
  status?: EnquiryStatus;
  limit: number;
  offset: number;
};

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
    .leftJoin(
      schema.project,
      eq(schema.enquiry.referredProjectId, schema.project.id),
    );
}

export const enquiriesRepository = {
  async findById(id: string): Promise<EnquiryViewRecord | null> {
    const [row] = await enquiryViewQuery()
      .where(eq(schema.enquiry.id, id))
      .limit(1);
    return row ?? null;
  },

  async findOpenByRequesterAndDesigner(
    requesterId: string,
    designerProfileId: string,
  ): Promise<EnquiryViewRecord | null> {
    const [row] = await enquiryViewQuery()
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

  async list(
    params: ListEnquiriesParams,
  ): Promise<{ items: EnquiryViewRecord[]; total: number }> {
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

  async create(params: CreateEnquiryParams): Promise<EnquiryViewRecord> {
    const [inserted] = await db
      .insert(schema.enquiry)
      .values({
        requesterId: params.requesterId,
        designerProfileId: params.designerProfileId,
        organizationId: params.organizationId,
        referredProjectId: params.referredProjectId ?? null,
        subject: params.subject,
        description: params.description,
        templateUsed: params.templateUsed ?? null,
        budget: params.budget,
        timeline: params.timeline ?? null,
        leadId: params.leadId,
      })
      .returning({ id: schema.enquiry.id });

    if (!inserted) throw new Error('enquiry insert returned no row');
    const record = await this.findById(inserted.id);
    if (!record) throw new Error('inserted enquiry not found');
    return record;
  },
};
