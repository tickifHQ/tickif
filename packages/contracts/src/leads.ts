import { z } from 'zod';

export const leadStatus = z.enum(['new', 'contacted', 'closed', 'spam']).meta({ id: 'LeadStatus' });
export type LeadStatus = z.infer<typeof leadStatus>;

export const leadListStatus = z
  .enum(['all', 'new', 'contacted', 'closed', 'spam'])
  .default('all')
  .meta({ id: 'LeadListStatus' });
export type LeadListStatus = z.infer<typeof leadListStatus>;

export const listLeadsQuerySchema = z
  .object({
    status: leadListStatus,
    q: z.string().trim().min(1).max(120).optional(),
    sortBy: z.enum(['name', 'receivedAt', 'budget']).default('receivedAt').optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .meta({ id: 'ListLeadsQuery' });
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const leadListItemSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    city: z.string().nullable(),
    referredProjectTitle: z.string().nullable(),
    contactNumber: z.string(),
    budgetBand: z.string().nullable(),
    status: leadStatus,
    receivedAt: z.string().datetime(),
  })
  .meta({ id: 'LeadListItem' });
export type LeadListItem = z.infer<typeof leadListItemSchema>;

export const listLeadsResponseSchema = z
  .object({
    items: z.array(leadListItemSchema),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'ListLeadsResponse' });
export type ListLeadsResponse = z.infer<typeof listLeadsResponseSchema>;

export const leadDetailResponseSchema = leadListItemSchema
  .extend({
    referredProjectId: z.uuid().nullable(),
    message: z.string().nullable(),
    source: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'LeadDetail' });
export type LeadDetailResponse = z.infer<typeof leadDetailResponseSchema>;

export const createLeadSchema = z
  .object({
    organizationId: z.string().optional(),
    referredProjectId: z.uuid().nullable().optional(),
    name: z.string().trim().min(1).max(160),
    contactNumber: z.string().trim().min(7).max(30),
    budgetBandSlug: z.string().trim().min(1).max(80).nullable().optional(),
    message: z.string().trim().max(2000).nullable().optional(),
    source: z.string().trim().min(1).max(80).optional(),
    receivedAt: z.string().datetime().optional(),
  })
  .meta({ id: 'CreateLead' });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z
  .object({
    status: leadStatus,
  })
  .meta({ id: 'UpdateLead' });
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const leadIdParamSchema = z.object({ id: z.uuid() }).meta({ id: 'LeadIdParam' });
