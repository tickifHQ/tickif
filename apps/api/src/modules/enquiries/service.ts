import type {
  CheckEnquiryQuery,
  CheckEnquiryResponse,
  CreateEnquiryInput,
  EnquiryResponse,
  EnquiryStatus,
  ListEnquiriesQuery,
  ListEnquiriesResponse,
} from '@repo/contracts';
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
  async create(input: CreateEnquiryInput, caller: EnquiryCaller): Promise<EnquiryResponse> {
    assertActiveCaller(caller);

    if (!caller.phoneNumber) {
      throw AppError.unprocessable('A verified phone number is required to send an enquiry');
    }

    const result = await enquiriesRepository.createWithLead({
      requesterId: caller.userId,
      designerProfileId: input.designerProfileId,
      referredProjectId: input.referredProjectId,
      subject: input.subject,
      description: input.description,
      templateUsed: input.templateUsed,
      budget: input.budget,
      timeline: input.timeline,
      requesterName: caller.name,
      requesterPhoneNumber: caller.phoneNumber,
    });

    if (result.kind === 'designer_not_found') {
      throw AppError.notFound('Designer profile not found');
    }
    if (result.kind === 'own_studio') {
      throw AppError.forbidden('You cannot send an enquiry to your own studio');
    }
    if (result.kind === 'existing_enquiry') {
      throw AppError.conflict('You already have an open enquiry with this designer');
    }
    return toResponse(result.enquiry);
  },

  async listMine(query: ListEnquiriesQuery, caller: EnquiryCaller): Promise<ListEnquiriesResponse> {
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

  async check(query: CheckEnquiryQuery, caller: EnquiryCaller): Promise<CheckEnquiryResponse> {
    assertActiveCaller(caller);

    const eligibility = await enquiriesRepository.findDesignerEligibility(
      query.designerProfileId,
      caller.userId,
    );
    if (!eligibility) {
      throw AppError.notFound('Designer profile not found');
    }
    if (eligibility.isOwnStudio) {
      return {
        canEnquire: false,
        unavailableReason: 'own_studio',
        exists: false,
        enquiryId: null,
      };
    }

    const existing = await enquiriesRepository.findOpenByRequesterAndDesigner(
      caller.userId,
      query.designerProfileId,
    );

    return {
      canEnquire: existing === null,
      unavailableReason: existing ? 'existing_enquiry' : null,
      exists: existing !== null,
      enquiryId: existing?.id ?? null,
    };
  },
};
