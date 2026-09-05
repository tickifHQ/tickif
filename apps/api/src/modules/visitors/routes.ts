import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  accountStatusSchema,
  errorResponseSchema,
  platformRoleSchema,
  upsertVisitorProfileSchema,
  visitorProfileResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requirePersonalContext } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { visitorsService, type VisitorCaller } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user']): VisitorCaller {
  if (!user) throw AppError.unauthorized();
  const role = platformRoleSchema.safeParse(user.role);
  const status = accountStatusSchema.safeParse(user.status);
  if (!role.success || !status.success) {
    throw AppError.forbidden('Visitor profile access is not permitted');
  }
  return {
    userId: user.id,
    role: role.data,
    status: status.data,
    isBanned: !!user.banned && (!user.banExpires || user.banExpires > new Date()),
  };
}

const getMineRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Visitors'],
  summary: 'Get the authenticated visitor profile',
  security: [{ cookieAuth: [] }],
  middleware: [requirePersonalContext] as const,
  responses: {
    200: {
      description: 'Persisted visitor onboarding profile',
      content: { 'application/json': { schema: visitorProfileResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Visitor profile access is not permitted'),
    404: errorJson('Visitor profile not found'),
  },
});

const upsertMineRoute = createRoute({
  method: 'put',
  path: '/me',
  tags: ['Visitors'],
  summary: 'Persist and complete visitor onboarding',
  security: [{ cookieAuth: [] }],
  middleware: [requirePersonalContext] as const,
  request: {
    body: {
      content: { 'application/json': { schema: upsertVisitorProfileSchema } },
    },
  },
  responses: {
    200: {
      description: 'Created or updated visitor onboarding profile',
      content: { 'application/json': { schema: visitorProfileResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Visitor profile access is not permitted'),
    422: errorJson('Invalid visitor onboarding profile'),
  },
});

export const visitorsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(getMineRoute, async (c) => {
    const result = await visitorsService.getMine(caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(upsertMineRoute, async (c) => {
    const result = await visitorsService.upsertMine(c.req.valid('json'), caller(c.get('user')));
    return c.json(result, 200);
  });

export type VisitorsRoutes = typeof visitorsRoutes;
