import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  adminActivitySummarySchema,
  adminEnquiriesQuerySchema,
  adminEnquiriesResponseSchema,
  adminUserActivityResponseSchema,
  adminUserIdParamSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAnyRole, requireAuth } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { adminActivityService } from './service.js';

const middleware = [requireAuth, requireAnyRole(['admin'])];
const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
const errors = { 401: errorJson('Unauthorized'), 403: errorJson('Admin role required') };

const summaryRoute = createRoute({
  method: 'get',
  path: '/summary',
  tags: ['Admin Activity'],
  summary: 'Get platform activity totals',
  security: [{ cookieAuth: [] }],
  middleware,
  responses: {
    200: {
      description: 'Platform totals',
      content: { 'application/json': { schema: adminActivitySummarySchema } },
    },
    ...errors,
  },
});

const usersRoute = createRoute({
  method: 'get',
  path: '/users',
  tags: ['Admin Activity'],
  summary: 'List users with filters and activity totals',
  security: [{ cookieAuth: [] }],
  middleware,
  request: { query: adminUsersQuerySchema },
  responses: {
    200: {
      description: 'User activity page',
      content: { 'application/json': { schema: adminUsersResponseSchema } },
    },
    ...errors,
  },
});

const userActivityRoute = createRoute({
  method: 'get',
  path: '/users/{id}/activity',
  tags: ['Admin Activity'],
  summary: 'Get recent search and view history for a user',
  security: [{ cookieAuth: [] }],
  middleware,
  request: { params: adminUserIdParamSchema },
  responses: {
    200: {
      description: 'Recent user activity',
      content: { 'application/json': { schema: adminUserActivityResponseSchema } },
    },
    ...errors,
  },
});

const enquiriesRoute = createRoute({
  method: 'get',
  path: '/enquiries',
  tags: ['Admin Activity'],
  summary: 'List enquiries across the platform',
  security: [{ cookieAuth: [] }],
  middleware,
  request: { query: adminEnquiriesQuerySchema },
  responses: {
    200: {
      description: 'Enquiry page',
      content: { 'application/json': { schema: adminEnquiriesResponseSchema } },
    },
    ...errors,
  },
});

export const adminActivityRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(summaryRoute, async (c) => c.json(await adminActivityService.summary(), 200))
  .openapi(usersRoute, async (c) =>
    c.json(await adminActivityService.listUsers(c.req.valid('query')), 200),
  )
  .openapi(userActivityRoute, async (c) =>
    c.json(await adminActivityService.userActivity(c.req.valid('param').id), 200),
  )
  .openapi(enquiriesRoute, async (c) =>
    c.json(await adminActivityService.listEnquiries(c.req.valid('query')), 200),
  );

export type AdminActivityRoutes = typeof adminActivityRoutes;
