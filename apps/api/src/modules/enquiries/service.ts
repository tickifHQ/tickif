import type {
  CheckEnquiryQuery,
  CheckEnquiryResponse,
  CreateEnquiryInput,
  EnquiryResponse,
  EnquiryStatus,
  ListEnquiriesQuery,
  ListEnquiriesResponse,
} from '@repo/contracts';
import { db, eq, schema } from '@repo/db';
import { AppError } from '../../lib/errors.js';
import { enquiriesRepository, type EnquiryViewRecord } from './repository.js';

export type EnquiryCaller = {
  userId: string;
  name: string;
  phoneNumber: string | null;
  isBanned: boolean;
};

function toResponse(row: EnquiryViewRecord): EnquiryResponse {
  return {
    id: row.id,
    designerProfile: {
      id: row.designerProfileId,
      displayName: row.designerDisplayName,
      logoUrl: null, // Logo presigning is out of scope for now
      location: row.designerAddress,
    },
    referredProjectId: row.referredProjectId,
    referredProjectTitle: row.referredProjectTitle,
    subject: row.subject,
    description: row.description,
    templateUsed: row.templateUsed,
    budget: row.budget,
    timeline: row.timeline,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function statusFilter(status: ListEnquiriesQuery['status']): EnquiryStatus | undefined {
  return status === 'all' ? undefined : (status as EnquiryStatus | undefined);
}

function assertActiveCaller(caller: EnquiryCaller): void {
  if (caller.isBanned) throw AppError.forbidden('Account suspended');
}

export const enquiriesService = {
  async create(
    input: CreateEnquiryInput,
    caller: EnquiryCaller,
  ): Promise<EnquiryResponse> {
    assertActiveCaller(caller);

    if (!caller.phoneNumber) {
      throw AppError.unprocessable('A verified phone number is required to send an enquiry');
    }

    // Check designer exists and is active
    const [designer] = await db
      .select({
        id: schema.designerProfile.id,
        organizationId: schema.designerProfile.orgId,
      })
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.id, input.designerProfileId))
      .limit(1);

    if (!designer) {
      throw AppError.notFound('Designer profile not found');
    }

    // Check for existing open enquiry
    const existing = await enquiriesRepository.findOpenByRequesterAndDesigner(
      caller.userId,
      input.designerProfileId,
    );
    if (existing) {
      throw AppError.conflict('You already have an open enquiry with this designer');
    }

    // Create lead for the designer's inbox
    const [leadRow] = await db
      .insert(schema.lead)
      .values({
        organizationId: designer.organizationId,
        referredProjectId: input.referredProjectId ?? null,
        name: caller.name,
        contactNumber: caller.phoneNumber,
        budgetBandSlug: input.budget,
        message: `[${input.subject}] ${input.description}`,
        source: 'enquiry',
      })
      .returning({ id: schema.lead.id });

    if (!leadRow) throw new Error('lead insert returned no row');

    // Create the enquiry record
    const enquiry = await enquiriesRepository.create({
      requesterId: caller.userId,
      designerProfileId: input.designerProfileId,
      organizationId: designer.organizationId,
      referredProjectId: input.referredProjectId,
      subject: input.subject,
      description: input.description,
      templateUsed: input.templateUsed,
      budget: input.budget,
      timeline: input.timeline,
      leadId: leadRow.id,
    });

    return toResponse(enquiry);
  },

  async listMine(
    query: ListEnquiriesQuery,
    caller: EnquiryCaller,
  ): Promise<ListEnquiriesResponse> {
    assertActiveCaller(caller);

    const { items, total } = await enquiriesRepository.list({
      requesterId: caller.userId,
      status: statusFilter(query.status),
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return {
      items: items.map(toResponse),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  },

  async check(
    query: CheckEnquiryQuery,
    caller: EnquiryCaller,
  ): Promise<CheckEnquiryResponse> {
    assertActiveCaller(caller);

    const existing = await enquiriesRepository.findOpenByRequesterAndDesigner(
      caller.userId,
      query.designerProfileId,
    );

    return {
      exists: existing !== null,
      enquiryId: existing?.id ?? null,
    };
  },
};
