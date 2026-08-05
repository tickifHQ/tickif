import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  adminReviewsQuerySchema,
  adminReviewsResponseSchema,
  errorResponseSchema,
  rejectReviewSchema,
  resolveReviewDisputeSchema,
  reviewIdParamSchema,
  reviewResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAnyRole, requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { reviewsService } from './service.js';

const adminMiddleware = [requireAuth, requireAnyRole(['admin'])];

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user']) {
  if (!user) throw AppError.unauthorized();
  return { userId: user.id };
}

const listReviewsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin Reviews'],
  summary: 'List reviews by moderation status',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { query: adminReviewsQuerySchema },
  responses: {
    200: {
      description: 'Moderation queue',
      content: { 'application/json': { schema: adminReviewsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
  },
});

const publishReviewRoute = createRoute({
  method: 'post',
  path: '/{id}/publish',
  tags: ['Admin Reviews'],
  summary: 'Publish a pending review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: reviewIdParamSchema },
  responses: {
    200: {
      description: 'Published review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Review not found'),
    409: errorJson('Review state changed'),
  },
});

const rejectReviewRoute = createRoute({
  method: 'post',
  path: '/{id}/reject',
  tags: ['Admin Reviews'],
  summary: 'Reject a pending review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: reviewIdParamSchema,
    body: {
      content: { 'application/json': { schema: rejectReviewSchema } },
    },
  },
  responses: {
    200: {
      description: 'Rejected review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Review not found'),
    409: errorJson('Review state changed'),
    422: errorJson('Invalid rejection'),
  },
});

const resolveDisputeRoute = createRoute({
  method: 'post',
  path: '/{id}/resolve-dispute',
  tags: ['Admin Reviews'],
  summary: 'Resolve a disputed review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: reviewIdParamSchema,
    body: {
      content: { 'application/json': { schema: resolveReviewDisputeSchema } },
    },
  },
  responses: {
    200: {
      description: 'Resolved review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Review not found'),
    409: errorJson('Review state changed'),
    422: errorJson('Invalid dispute resolution'),
  },
});

export const adminReviewsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listReviewsRoute, async (c) => {
    const result = await reviewsService.listAdmin(c.req.valid('query'));
    return c.json(result, 200);
  })
  .openapi(publishReviewRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await reviewsService.publish(id, caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(rejectReviewRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await reviewsService.reject(
      id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(resolveDisputeRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await reviewsService.resolveDispute(
      id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  });

export type AdminReviewsRoutes = typeof adminReviewsRoutes;
