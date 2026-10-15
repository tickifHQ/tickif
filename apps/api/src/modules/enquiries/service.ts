import type {
  CheckEnquiryQuery,
  CheckEnquiryResponse,
  CreateEnquiryInput,
  EnquiryResponse,
  EnquiryStatus,
  ListEnquiriesQuery,
  ListEnquiriesResponse,
  EnquiryMessagesQuery,
  EnquiryThread,
  EnquiryCounts,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { enquiriesRepository, type EnquiryViewRecord } from './repository.js';
import { enquiryActivityRepository } from './activity-repository.js';
import { presignDownload } from '@repo/storage';
import { projectsService } from '../projects/service.js';

export type EnquiryCaller = {
  userId: string;
  name: string;
  phoneNumber: string | null;
  isBanned: boolean;
};

function toResponse(
  row: EnquiryViewRecord,
  logoUrl: string | null = null,
  imageUrl: string | null = null,
): EnquiryResponse {
  return {
    id: row.id,
    designerProfile: {
      id: row.designerProfileId,
      displayName: row.designerDisplayName,
      logoUrl,
      location: row.designerAddress,
    },
    referredProjectId: row.referredProjectId,
    referredProjectTitle: row.referredProjectTitle,
    referredProjectImageUrl: imageUrl,
    activity: {
      viewedAt: row.viewedAt?.toISOString() ?? null,
      contactedAt: row.contactedAt?.toISOString() ?? null,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      isNew: row.hasUnreadActivity,
      readThrough: row.readThrough,
    },
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
  async counts(caller: EnquiryCaller): Promise<EnquiryCounts> {
    assertActiveCaller(caller);
    return enquiriesRepository.counts(caller.userId);
  },
  async messages(
    id: string,
    query: EnquiryMessagesQuery,
    caller: EnquiryCaller,
  ): Promise<EnquiryThread> {
    assertActiveCaller(caller);
    const enquiry = await enquiriesRepository.findById(id);
    if (!enquiry || enquiry.requesterId !== caller.userId)
      throw AppError.notFound('Enquiry not found');
    const rows = await enquiryActivityRepository.messages(
      id,
      query.limit + 1,
      (query.page - 1) * query.limit,
    );
    return {
      enquiryId: id,
      canReply: false,
      hasMore: rows.length > query.limit,
      readThrough: rows[0]?.readThrough ?? null,
      messages: rows
        .slice(0, query.limit)
        .map(({ id, body, createdAt }) => ({ id, body, createdAt: createdAt.toISOString() })),
    };
  },
  async read(id: string, through: string, caller: EnquiryCaller) {
    assertActiveCaller(caller);
    const acknowledged = await enquiryActivityRepository.read(id, caller.userId, through);
    if (!acknowledged) throw AppError.notFound('Enquiry not found');
    return { acknowledged };
  },
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

    const [covers, logos] = await Promise.all([
      projectsService
        .publicEnquiryCovers(
          items.flatMap((row) => (row.referredProjectId ? [row.referredProjectId] : [])),
        )
        .catch(() => new Map<string, string | null>()),
      Promise.all(
        [
          ...new Set(
            items.flatMap((row) => (row.designerLogoImageId ? [row.designerLogoImageId] : [])),
          ),
        ].map(async (key) => [key, await presignDownload({ key }).catch(() => null)] as const),
      ).then((pairs) => new Map(pairs)),
    ]);
    return {
      items: items.map((row) =>
        toResponse(
          row,
          logos.get(row.designerLogoImageId ?? '') ?? null,
          covers.get(row.referredProjectId ?? '') ?? null,
        ),
      ),
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
