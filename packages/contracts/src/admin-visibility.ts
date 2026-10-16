import { z } from 'zod';
import { leadStatus } from './leads';
import { enquiryStatusSchema } from './enquiries';

const scopeFields = {
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  organizationId: z.string().trim().min(1).max(200).optional(),
  designerId: z.uuid().optional(),
};
const pageFields = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const scopeCheck = (value: { from?: string; to?: string }) => {
  if (!value.from && !value.to) return true;
  if (!value.from || !value.to) return false;
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000;
  return days >= 0 && days < 366;
};
const scopeError = {
  message: 'Choose both dates, in order, spanning at most 366 days',
  path: ['to'],
};

export const adminReportQuerySchema = z
  .object(scopeFields)
  .refine(scopeCheck, scopeError)
  .meta({ id: 'AdminReportQuery' });
export const adminLeadQuerySchema = z
  .object({
    ...scopeFields,
    ...pageFields,
    status: leadStatus.optional(),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .refine(scopeCheck, scopeError)
  .meta({ id: 'AdminLeadQuery' });
export const adminEntityQuerySchema = z
  .object({
    ...scopeFields,
    ...pageFields,
    groupBy: z.enum(['company', 'designer']).default('company'),
    q: z.string().trim().min(1).max(120).optional(),
  })
  .refine(scopeCheck, scopeError)
  .meta({ id: 'AdminEntityQuery' });
export const adminLeadIdSchema = z.object({ id: z.uuid() }).meta({ id: 'AdminLeadId' });
export const adminThreadQuerySchema = z.object(pageFields).meta({ id: 'AdminThreadQuery' });
export const adminCompanySearchQuerySchema = z
  .object({
    ...pageFields,
    q: z.string().trim().min(1).max(120).optional(),
    id: z.string().trim().min(1).max(200).optional(),
  })
  .meta({ id: 'AdminCompanySearchQuery' });

const identity = z.object({ id: z.string(), name: z.string() });
const nullableIdentity = identity.nullable();
const count = z.number().int().nonnegative();
const pageResponse = { page: count, limit: count, total: count, totalPages: count };
export const adminCompanySearchResponseSchema = z
  .object({
    ...pageResponse,
    items: z.array(identity),
  })
  .meta({ id: 'AdminCompanySearchResponse' });
export const adminReportWindowSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .meta({ id: 'AdminReportWindow' });
export const adminVisibilityMetricsSchema = z
  .object({
    leads: count,
    new: count,
    contacted: count,
    closed: count,
    spam: count,
    enquiries: count,
    openEnquiries: count,
    closedEnquiries: count,
    respondedEnquiries: count,
    progressedEnquiries: count,
    projectViews: count,
    profileViews: count,
    projectsCreated: count,
    responseRate: z.number().min(0).max(100),
    conversionRate: z.number().min(0).max(100),
  })
  .meta({ id: 'AdminVisibilityMetrics' });
export const adminReportResponseSchema = z
  .object({
    window: adminReportWindowSchema,
    metrics: adminVisibilityMetricsSchema,
    activity: z.array(
      z.object({ date: z.iso.date(), enquiries: count, responded: count, progressed: count }),
    ),
  })
  .meta({ id: 'AdminReportResponse' });
export const adminEntityResponseSchema = z
  .object({
    ...pageResponse,
    window: adminReportWindowSchema,
    items: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        organizationId: z.string(),
        companyName: z.string(),
        status: z.string().nullable(),
        metrics: adminVisibilityMetricsSchema,
      }),
    ),
  })
  .meta({ id: 'AdminEntityResponse' });
export const adminLeadItemSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    contactNumber: z.string(),
    budget: z.string().nullable(),
    source: z.string(),
    status: leadStatus,
    receivedAt: z.string().datetime(),
    company: identity,
    branch: identity,
    designer: nullableIdentity,
    assignedMember: nullableIdentity,
    project: nullableIdentity,
    enquiryId: z.uuid().nullable(),
  })
  .meta({ id: 'AdminLeadItem' });
export const adminLeadResponseSchema = z
  .object({
    ...pageResponse,
    window: adminReportWindowSchema,
    items: z.array(adminLeadItemSchema),
    pipeline: z.object({ total: count, new: count, contacted: count, closed: count, spam: count }),
  })
  .meta({ id: 'AdminLeadResponse' });
export const adminLeadDetailSchema = adminLeadItemSchema
  .extend({
    message: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    enquiry: z
      .object({
        id: z.uuid(),
        requester: identity.extend({ email: z.string(), phone: z.string().nullable() }),
        subject: z.string(),
        description: z.string(),
        budget: z.string(),
        timeline: z.string().nullable(),
        templateUsed: z.string().nullable(),
        status: enquiryStatusSchema,
        viewedAt: z.string().datetime().nullable(),
        contactedAt: z.string().datetime().nullable(),
        lastMessageAt: z.string().datetime().nullable(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
      })
      .nullable(),
    messages: z.object({
      ...pageResponse,
      items: z.array(
        z.object({
          id: z.uuid(),
          body: z.string(),
          author: nullableIdentity,
          createdAt: z.string().datetime(),
        }),
      ),
    }),
  })
  .meta({ id: 'AdminLeadDetail' });

export type AdminReportQuery = z.infer<typeof adminReportQuerySchema>;
export type AdminLeadQuery = z.infer<typeof adminLeadQuerySchema>;
export type AdminEntityQuery = z.infer<typeof adminEntityQuerySchema>;
export type AdminThreadQuery = z.infer<typeof adminThreadQuerySchema>;
export type AdminCompanySearchQuery = z.infer<typeof adminCompanySearchQuerySchema>;
export type AdminCompanySearchResponse = z.infer<typeof adminCompanySearchResponseSchema>;
export type AdminVisibilityMetrics = z.infer<typeof adminVisibilityMetricsSchema>;
export type AdminReportResponse = z.infer<typeof adminReportResponseSchema>;
export type AdminEntityResponse = z.infer<typeof adminEntityResponseSchema>;
export type AdminLeadItem = z.infer<typeof adminLeadItemSchema>;
export type AdminLeadResponse = z.infer<typeof adminLeadResponseSchema>;
export type AdminLeadDetail = z.infer<typeof adminLeadDetailSchema>;

/** Calendar dates and cohort boundaries use India time throughout admin reporting. */
export function adminReportWindow(query: AdminReportQuery, now = new Date()) {
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return {
    from: query.from ?? new Date(Date.parse(today) - 29 * 86_400_000).toISOString().slice(0, 10),
    to: query.to ?? today,
  };
}
