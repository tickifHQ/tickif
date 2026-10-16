import type {
  AdminCompanySearchQuery,
  AdminCompanySearchResponse,
  AdminEntityQuery,
  AdminEntityResponse,
  AdminLeadDetail,
  AdminLeadItem,
  AdminLeadQuery,
  AdminLeadResponse,
  AdminReportQuery,
  AdminReportResponse,
  AdminThreadQuery,
  AdminVisibilityMetrics,
} from '@repo/contracts';
import { adminReportWindow } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { adminVisibilityRepository as repository, type LeadRow } from './repository.js';

const iso = (value: Date | string) => new Date(value).toISOString();
const nullableIso = (value: Date | null) => (value ? iso(value) : null);
const pagination = (query: { page: number; limit: number }, total: number) => ({
  page: query.page,
  limit: query.limit,
  total,
  totalPages: Math.ceil(total / query.limit),
});
function metrics(
  row: Omit<AdminVisibilityMetrics, 'responseRate' | 'conversionRate'>,
): AdminVisibilityMetrics {
  return {
    ...row,
    responseRate: row.enquiries ? (row.respondedEnquiries / row.enquiries) * 100 : 0,
    conversionRate: row.enquiries ? (row.progressedEnquiries / row.enquiries) * 100 : 0,
  };
}
function leadItem(row: LeadRow): AdminLeadItem {
  return {
    id: row.id,
    name: row.name,
    contactNumber: row.contactNumber,
    budget: row.budget,
    source: row.source,
    status: row.status,
    receivedAt: iso(row.receivedAt),
    company: row.company,
    branch: row.branch,
    designer: row.designer,
    assignedMember: row.assignedMember,
    project: row.project,
    enquiryId: row.enquiryId,
  };
}
async function assertScope(query: AdminReportQuery) {
  if (!(await repository.scopeExists(query)))
    throw AppError.notFound('Company or designer not found in this scope');
}

export const adminVisibilityService = {
  async companies(query: AdminCompanySearchQuery): Promise<AdminCompanySearchResponse> {
    const result = await repository.companies(query);
    return { ...result, ...pagination(query, result.total) };
  },
  async leads(query: AdminLeadQuery): Promise<AdminLeadResponse> {
    const window = adminReportWindow(query);
    const scope = { ...query, ...window };
    await assertScope(scope);
    const result = await repository.leads(scope);
    const pipeline = { total: 0, new: 0, contacted: 0, closed: 0, spam: 0 };
    for (const row of result.pipeline) {
      pipeline[row.status] = row.count;
      pipeline.total += row.count;
    }
    return {
      ...pagination(query, result.total),
      window,
      items: result.items.map(leadItem),
      pipeline,
    };
  },
  async lead(id: string, query: AdminThreadQuery): Promise<AdminLeadDetail> {
    const row = await repository.lead(id);
    if (!row) throw AppError.notFound('Lead not found');
    const [enquiry, messages] = row.enquiryId
      ? await Promise.all([
          repository.enquiry(row.enquiryId),
          repository.messages(row.enquiryId, query.page, query.limit),
        ])
      : [null, { items: [], total: 0 }];
    return {
      ...leadItem(row),
      message: row.message,
      notes: row.notes,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      enquiry: enquiry
        ? {
            id: enquiry.id,
            requester: {
              id: enquiry.requesterId,
              name: enquiry.requesterName,
              email: enquiry.requesterEmail,
              phone: enquiry.requesterPhone,
            },
            subject: enquiry.subject,
            description: enquiry.description,
            budget: enquiry.budget,
            timeline: enquiry.timeline,
            templateUsed: enquiry.templateUsed,
            status: enquiry.status,
            viewedAt: nullableIso(enquiry.viewedAt),
            contactedAt: nullableIso(enquiry.contactedAt),
            lastMessageAt: nullableIso(enquiry.lastMessageAt),
            createdAt: iso(enquiry.createdAt),
            updatedAt: iso(enquiry.updatedAt),
          }
        : null,
      messages: {
        ...pagination(query, messages.total),
        items: messages.items.map((item) => ({
          ...item,
          createdAt: iso(item.createdAt),
        })),
      },
    };
  },
  async entities(query: AdminEntityQuery): Promise<AdminEntityResponse> {
    const window = adminReportWindow(query);
    const scope = { ...query, ...window };
    await assertScope(scope);
    const result = await repository.entities(scope);
    return {
      ...pagination(query, result.total),
      window,
      items: result.items.map(({ id, name, organizationId, companyName, status, ...counts }) => ({
        id,
        name,
        organizationId,
        companyName,
        status,
        metrics: metrics(counts),
      })),
    };
  },
  async report(query: AdminReportQuery): Promise<AdminReportResponse> {
    const window = adminReportWindow(query);
    const scope = { ...query, ...window };
    await assertScope(scope);
    const result = await repository.report(scope);
    const byDate = new Map(result.activity.map((day) => [day.date, day]));
    const activity: AdminReportResponse['activity'] = [];
    for (let day = Date.parse(window.from); day <= Date.parse(window.to); day += 86_400_000) {
      const date = new Date(day).toISOString().slice(0, 10);
      activity.push(byDate.get(date) ?? { date, enquiries: 0, responded: 0, progressed: 0 });
    }
    return { window, metrics: metrics(result.metrics), activity };
  },
};
