import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createLeadSchema,
  errorResponseSchema,
  leadDetailResponseSchema,
  leadIdParamSchema,
  listLeadsQuerySchema,
  listLeadsResponseSchema,
  updateLeadSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { leadsService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user'], session?: AuthVariables['session']) {
  if (!user) throw AppError.unauthorized();
  const isBanned = !!user.banned && (!user.banExpires || user.banExpires > new Date());
  return {
    userId: user.id,
    isBanned,
    activeOrgId: session?.activeOrganizationId ?? null,
  };
}

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Leads'],
  summary: 'List leads for the caller organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: listLeadsQuerySchema },
  responses: {
    200: {
      description: 'A page of leads',
      content: { 'application/json': { schema: listLeadsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot list these leads'),
    422: errorJson('No active organization selected'),
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Leads'],
  summary: 'Get a lead by id',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: leadIdParamSchema },
  responses: {
    200: {
      description: 'The lead',
      content: { 'application/json': { schema: leadDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot read this lead'),
    404: errorJson('Lead not found'),
    422: errorJson('No active organization selected'),
  },
});

const createRouteInternal = createRoute({
  method: 'post',
  path: '/',
  tags: ['Leads'],
  summary: 'Create a lead for tests/internal seed flows',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: createLeadSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created lead',
      content: { 'application/json': { schema: leadDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot create this lead'),
    422: errorJson('Invalid lead references'),
  },
});

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Leads'],
  summary: 'Update lead status',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: leadIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateLeadSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated lead',
      content: { 'application/json': { schema: leadDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot update this lead'),
    404: errorJson('Lead not found'),
    422: errorJson('No active organization selected or invalid lead status'),
  },
});

export const leadsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listRoute, async (c) => {
    const result = await leadsService.list(
      c.req.valid('query'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(createRouteInternal, async (c) => {
    const result = await leadsService.create(
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 201);
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await leadsService.getById(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await leadsService.update(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  });

export type LeadsRoutes = typeof leadsRoutes;
