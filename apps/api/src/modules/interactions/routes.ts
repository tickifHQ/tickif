import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  recordViewEventResponseSchema,
  recordViewEventSchema,
  projectEngagementQuerySchema,
  projectEngagementResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { interactionsService } from './service.js';

const recordViewRoute = createRoute({
  method: 'post',
  path: '/views',
  tags: ['Interactions'],
  summary: 'Record a public project or designer profile page view',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: recordViewEventSchema } },
    },
  },
  responses: {
    202: {
      description: 'View accepted, deduplicated, or excluded as an organization self-view',
      content: { 'application/json': { schema: recordViewEventResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Public target not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Invalid event payload',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const interactionsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(
    createRoute({
      method: 'get',
      path: '/projects',
      tags: ['Interactions'],
      summary: 'Public lifetime view and current save totals for up to 48 visible projects',
      request: { query: projectEngagementQuerySchema },
      responses: {
        200: {
          description: 'Public project counts; no visitor identities',
          content: { 'application/json': { schema: projectEngagementResponseSchema } },
        },
        422: {
          description: 'Invalid project ids',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      c.header('Cache-Control', 'no-store');
      return c.json(await interactionsService.projectCounts(c.req.valid('query')), 200);
    },
  )
  .openapi(recordViewRoute, async (c) => {
    const result = await interactionsService.recordView({
      actorUserId: c.get('user')!.id,
      event: c.req.valid('json'),
    });
    return c.json(result, 202);
  });

export type InteractionsRoutes = typeof interactionsRoutes;
