import { z } from 'zod';
import { platformRoleSchema } from './auth';

const adminPageQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};

export const adminUsersQuerySchema = z
  .object({
    ...adminPageQueryFields,
    q: z.string().trim().min(1).max(120).optional(),
    role: platformRoleSchema.optional(),
    status: z.enum(['pending', 'active', 'suspended', 'deleted']).optional(),
  })
  .meta({ id: 'AdminUsersQuery' });
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const adminEnquiriesQuerySchema = z
  .object({
    ...adminPageQueryFields,
    status: z.enum(['open', 'responded', 'closed']).optional(),
  })
  .meta({ id: 'AdminEnquiriesQuery' });
export type AdminEnquiriesQuery = z.infer<typeof adminEnquiriesQuerySchema>;

export const adminActivitySummarySchema = z
  .object({
    users: z.number().int().nonnegative(),
    activeUsers: z.number().int().nonnegative(),
    enquiries: z.number().int().nonnegative(),
    openEnquiries: z.number().int().nonnegative(),
    projectViews: z.number().int().nonnegative(),
    profileViews: z.number().int().nonnegative(),
    searches: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminActivitySummary' });

export const adminUserActivityItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    phoneNumber: z.string().nullable(),
    role: platformRoleSchema,
    status: z.enum(['pending', 'active', 'suspended', 'deleted']),
    banned: z.boolean(),
    projectViews: z.number().int().nonnegative(),
    profileViews: z.number().int().nonnegative(),
    searches: z.number().int().nonnegative(),
    enquiries: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    lastActiveAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'AdminUserActivityItem' });

export const adminUsersResponseSchema = z
  .object({
    items: z.array(adminUserActivityItemSchema),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminUsersResponse' });

export const adminEnquiryItemSchema = z
  .object({
    id: z.string().uuid(),
    requester: z.object({ id: z.string(), name: z.string(), email: z.string().email() }),
    designer: z.object({ id: z.string().uuid(), displayName: z.string() }),
    organizationId: z.string(),
    referredProject: z.object({ id: z.string().uuid(), title: z.string() }).nullable(),
    subject: z.string(),
    budget: z.string(),
    timeline: z.string().nullable(),
    status: z.enum(['open', 'responded', 'closed']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'AdminEnquiryItem' });

export const adminEnquiriesResponseSchema = z
  .object({
    items: z.array(adminEnquiryItemSchema),
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .meta({ id: 'AdminEnquiriesResponse' });

export const adminUserIdParamSchema = z.object({ id: z.string().min(1) });

export const adminUserActivityResponseSchema = z
  .object({
    searches: z.array(
      z.object({
        endpoint: z.enum(['projects', 'designers']),
        query: z.string(),
        createdAt: z.string().datetime(),
      }),
    ),
    projectViews: z.array(
      z.object({
        projectId: z.string().uuid(),
        title: z.string(),
        createdAt: z.string().datetime(),
      }),
    ),
    profileViews: z.array(
      z.object({
        designerProfileId: z.string().uuid(),
        displayName: z.string(),
        createdAt: z.string().datetime(),
      }),
    ),
  })
  .meta({ id: 'AdminUserActivityResponse' });

export type AdminActivitySummary = z.infer<typeof adminActivitySummarySchema>;
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;
export type AdminEnquiriesResponse = z.infer<typeof adminEnquiriesResponseSchema>;
export type AdminUserActivityResponse = z.infer<typeof adminUserActivityResponseSchema>;
