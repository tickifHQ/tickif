import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  checkEnquiryQuerySchema,
  checkEnquiryResponseSchema,
  createEnquirySchema,
  enquiryResponseSchema,
  errorResponseSchema,
  listEnquiriesQuerySchema,
  listEnquiriesResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { enquiriesService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user']) {
  if (!user) throw AppError.unauthorized();
  return {
    userId: user.id,
    name: user.name,
    phoneNumber: user.phoneNumber ?? null,
    isBanned: !!user.banned && (!user.banExpires || user.banExpires > new Date()),
  };
}

const createEnquiryRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Enquiries'],
  summary: 'Send an enquiry to a designer',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: createEnquirySchema } },
    },
  },
  responses: {
    201: {
      description: 'Enquiry sent',
      content: { 'application/json': { schema: enquiryResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended or enquiry targets the caller’s own studio'),
    404: errorJson('Designer profile not found'),
    409: errorJson('Open enquiry already exists'),
    422: errorJson('Invalid enquiry'),
  },
});

const listMineRoute = createRoute({
  method: 'get',
  path: '/mine',
  tags: ['Enquiries'],
  summary: 'List enquiries sent by the caller',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: listEnquiriesQuerySchema },
  responses: {
    200: {
      description: 'Enquiry list',
      content: { 'application/json': { schema: listEnquiriesResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended'),
  },
});

const checkRoute = createRoute({
  method: 'get',
  path: '/check',
  tags: ['Enquiries'],
  summary: 'Check whether the caller can enquire with a designer',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: checkEnquiryQuerySchema },
  responses: {
    200: {
      description: 'Check result',
      content: { 'application/json': { schema: checkEnquiryResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended'),
    404: errorJson('Designer profile not found'),
  },
});

export const enquiriesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(createEnquiryRoute, async (c) => {
    const result = await enquiriesService.create(c.req.valid('json'), caller(c.get('user')));
    return c.json(result, 201);
  })
  .openapi(listMineRoute, async (c) => {
    const result = await enquiriesService.listMine(c.req.valid('query'), caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(checkRoute, async (c) => {
    const result = await enquiriesService.check(c.req.valid('query'), caller(c.get('user')));
    return c.json(result, 200);
  });

export type EnquiriesRoutes = typeof enquiriesRoutes;
