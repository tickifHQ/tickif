import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  recordViewEventResponseSchema,
  recordViewEventSchema,
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
      description: 'View accepted or previously recorded idempotently',
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
}).openapi(recordViewRoute, async (c) => {
  const result = await interactionsService.recordView({
    actorUserId: c.get('user')!.id,
    event: c.req.valid('json'),
  });
  return c.json(result, 202);
});

export type InteractionsRoutes = typeof interactionsRoutes;
