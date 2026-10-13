import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  checkEnquiryQuerySchema,
  checkEnquiryResponseSchema,
  createEnquirySchema,
  enquiryResponseSchema,
  errorResponseSchema,
  listEnquiriesQuerySchema,
  listEnquiriesResponseSchema,
  enquiryIdParamSchema,
  enquiryThreadSchema,
  enquiryMessagesQuerySchema,
  enquiryReadSchema,
  enquiryActivityResultSchema,
  enquiryCountsSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireCustomerAccess as requireAuth } from '../../lib/auth-middleware.js';
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

const countsRoute = createRoute({
  method: 'get',
  path: '/counts',
  tags: ['Enquiries'],
  summary: 'Private total and unread enquiry counts across all pages',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Enquiry counts',
      content: { 'application/json': { schema: enquiryCountsSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Forbidden'),
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

const messagesRoute = createRoute({
  method: 'get',
  path: '/{id}/messages',
  tags: ['Enquiries'],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: enquiryIdParamSchema, query: enquiryMessagesQuerySchema },
  responses: {
    200: {
      description: 'Studio messages for the requester',
      content: { 'application/json': { schema: enquiryThreadSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Forbidden'),
    404: errorJson('Enquiry not found'),
    422: errorJson('Invalid request'),
  },
});
const readRoute = createRoute({
  method: 'post',
  path: '/{id}/read',
  tags: ['Enquiries'],
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: enquiryIdParamSchema,
    body: { content: { 'application/json': { schema: enquiryReadSchema } } },
  },
  responses: {
    200: {
      description: 'Read activity acknowledged',
      content: { 'application/json': { schema: enquiryActivityResultSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Forbidden'),
    404: errorJson('Enquiry not found'),
    422: errorJson('Invalid request'),
  },
});

export const enquiriesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(countsRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await enquiriesService.counts(caller(c.get('user'))), 200);
  })
  .openapi(createEnquiryRoute, async (c) => {
    const result = await enquiriesService.create(c.req.valid('json'), caller(c.get('user')));
    return c.json(result, 201);
  })
  .openapi(listMineRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    const result = await enquiriesService.listMine(c.req.valid('query'), caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(messagesRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await enquiriesService.messages(
        c.req.valid('param').id,
        c.req.valid('query'),
        caller(c.get('user')),
      ),
      200,
    );
  })
  .openapi(readRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await enquiriesService.read(
        c.req.valid('param').id,
        c.req.valid('json').through,
        caller(c.get('user')),
      ),
      200,
    );
  })
  .openapi(checkRoute, async (c) => {
    const result = await enquiriesService.check(c.req.valid('query'), caller(c.get('user')));
    return c.json(result, 200);
  });

export type EnquiriesRoutes = typeof enquiriesRoutes;
