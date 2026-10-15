import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const enquiryStatusSchema = z
  .enum(['open', 'responded', 'closed'])
  .meta({ id: 'EnquiryStatus' });
export type EnquiryStatus = z.infer<typeof enquiryStatusSchema>;

export const enquiryCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
  })
  .refine((counts) => counts.unread <= counts.total, 'Unread count cannot exceed total')
  .meta({ id: 'EnquiryCounts' });
export type EnquiryCounts = z.infer<typeof enquiryCountsSchema>;

export const enquiryListStatusSchema = z
  .enum(['all', 'open', 'responded', 'closed'])
  .default('all')
  .meta({ id: 'EnquiryListStatus' });

export const createEnquirySchema = z
  .object({
    designerProfileId: z.uuid(),
    referredProjectId: z.uuid().optional(),
    subject: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    templateUsed: z.string().trim().max(100).optional(),
    budget: z.string().trim().min(1).max(50),
    timeline: z.string().trim().max(50).optional(),
  })
  .meta({ id: 'CreateEnquiry' });
export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;

export const listEnquiriesQuerySchema = z
  .object({
    status: enquiryListStatusSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .meta({ id: 'ListEnquiriesQuery' });
export type ListEnquiriesQuery = z.infer<typeof listEnquiriesQuerySchema>;

export const checkEnquiryQuerySchema = z
  .object({
    designerProfileId: z.uuid(),
  })
  .meta({ id: 'CheckEnquiryQuery' });
export type CheckEnquiryQuery = z.infer<typeof checkEnquiryQuerySchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const enquiryDesignerSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  logoUrl: z.url().nullable(),
  location: z.string().nullable(),
});

export const enquiryActivitySchema = z
  .object({
    viewedAt: z.string().datetime().nullable(),
    contactedAt: z.string().datetime().nullable(),
    lastMessageAt: z.string().datetime().nullable(),
    // Opaque full-precision watermark: clients must not round-trip it through Date.
    readThrough: z.string().datetime().optional(),
    isNew: z.boolean(),
  })
  .meta({ id: 'EnquiryActivity' });
export const enquiryMessageSchema = z
  .object({
    id: z.uuid(),
    body: z.string(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'EnquiryMessage' });
export const sendEnquiryMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    requestId: z.uuid(),
  })
  .meta({ id: 'SendEnquiryMessage' });
export const enquiryThreadSchema = z
  .object({
    enquiryId: z.uuid().nullable(),
    messages: z.array(enquiryMessageSchema),
    hasMore: z.boolean(),
    canReply: z.boolean(),
    readThrough: z.string().datetime().nullable().optional(),
  })
  .meta({ id: 'EnquiryThread' });
export const enquiryMessagesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .meta({ id: 'EnquiryMessagesQuery' });
export const enquiryReadSchema = z
  .object({ through: z.string().datetime() })
  .meta({ id: 'EnquiryRead' });
export const enquiryActivityResultSchema = z
  .object({ acknowledged: z.boolean() })
  .meta({ id: 'EnquiryActivityResult' });
export type SendEnquiryMessage = z.infer<typeof sendEnquiryMessageSchema>;
export type EnquiryMessagesQuery = z.infer<typeof enquiryMessagesQuerySchema>;
export type EnquiryThread = z.infer<typeof enquiryThreadSchema>;

export const enquiryResponseSchema = z
  .object({
    id: z.uuid(),
    designerProfile: enquiryDesignerSchema,
    referredProjectId: z.uuid().nullable(),
    referredProjectTitle: z.string().nullable(),
    referredProjectImageUrl: z.url().nullable().optional(),
    activity: enquiryActivitySchema.optional(),
    subject: z.string(),
    description: z.string(),
    templateUsed: z.string().nullable(),
    budget: z.string(),
    timeline: z.string().nullable(),
    status: enquiryStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'EnquiryResponse' });
export type EnquiryResponse = z.infer<typeof enquiryResponseSchema>;

export const listEnquiriesResponseSchema = z
  .object({
    items: z.array(enquiryResponseSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .meta({ id: 'ListEnquiriesResponse' });
export type ListEnquiriesResponse = z.infer<typeof listEnquiriesResponseSchema>;

export const checkEnquiryResponseSchema = z
  .object({
    canEnquire: z.boolean(),
    unavailableReason: z.enum(['own_studio', 'existing_enquiry']).nullable(),
    exists: z.boolean(),
    enquiryId: z.uuid().nullable(),
  })
  .meta({ id: 'CheckEnquiryResponse' });
export type CheckEnquiryResponse = z.infer<typeof checkEnquiryResponseSchema>;

export const enquiryIdParamSchema = z.object({ id: z.uuid() }).meta({ id: 'EnquiryIdParam' });
