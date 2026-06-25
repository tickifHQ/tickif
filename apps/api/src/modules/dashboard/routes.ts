import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  dashboardOverviewResponseSchema,
  dashboardOverviewShareResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { dashboardService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

const overviewRoute = createRoute({
  method: 'get',
  path: '/overview',
  tags: ['Dashboard'],
  summary: 'Get designer dashboard overview data',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Overview page aggregate',
      content: { 'application/json': { schema: dashboardOverviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Designer profile required'),
  },
});

const shareRoute = createRoute({
  method: 'post',
  path: '/overview/share',
  tags: ['Dashboard'],
  summary: 'Record that the designer copied/shared their public portfolio link',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Updated public portfolio share count',
      content: { 'application/json': { schema: dashboardOverviewShareResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Designer profile required'),
  },
});

export const dashboardRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(overviewRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await dashboardService.getOverview({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(shareRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await dashboardService.recordPortfolioShare({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  });

export type DashboardRoutes = typeof dashboardRoutes;
