import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  analyticsQuerySchema,
  analyticsResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { reportsService } from './service.js';

const analyticsRoute = createRoute({
  method: 'get',
  path: '/analytics',
  tags: ['Reports'],
  summary: 'Get role- and tier-scoped analytics for the active organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: analyticsQuerySchema },
  responses: {
    200: {
      description: 'Role-scoped engagement or billing metrics with tier and branch access metadata',
      content: { 'application/json': { schema: analyticsResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'Membership or analytics scope does not allow this view',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    402: {
      description: 'Branch analytics require Corporate',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Requested active branch not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Invalid analytics window or no active organization selected',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const reportsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
}).openapi(analyticsRoute, async (c) => {
  const user = c.get('user')!;
  const session = c.get('session');
  const result = await reportsService.getAnalytics({
    userId: user.id,
    orgId: session?.activeOrganizationId ?? null,
    query: c.req.valid('query'),
  });
  return c.json(result, 200);
});

export type ReportsRoutes = typeof reportsRoutes;
