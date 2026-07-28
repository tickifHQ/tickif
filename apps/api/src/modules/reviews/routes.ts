import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createReviewSchema,
  disputeReviewSchema,
  errorResponseSchema,
  listPublishedReviewsQuerySchema,
  publishedReviewsResponseSchema,
  reviewIdParamSchema,
  reviewResponseSchema,
  updateReviewSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAnyRole, requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { reviewsService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user'], session: AuthVariables['session']) {
  if (!user) throw AppError.unauthorized();
  return {
    userId: user.id,
    phoneNumberVerified: user.phoneNumberVerified === true,
    activeOrgId: session?.activeOrganizationId ?? null,
  };
}

const listPublishedRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Reviews'],
  summary: 'List published reviews for a designer',
  request: { query: listPublishedReviewsQuerySchema },
  responses: {
    200: {
      description: 'Published review page and Tickif rating aggregate',
      content: { 'application/json': { schema: publishedReviewsResponseSchema } },
    },
  },
});

const createReviewRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Reviews'],
  summary: 'Submit a review for moderation',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: createReviewSchema } },
    },
  },
  responses: {
    201: {
      description: 'Pending review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Self review or suspended account'),
    404: errorJson('Designer profile not found'),
    409: errorJson('Duplicate review'),
    422: errorJson('Review eligibility failed'),
  },
});

const updateReviewRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Reviews'],
  summary: 'Edit an eligible review and return it to moderation',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: reviewIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateReviewSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated pending review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended'),
    404: errorJson('Review not found'),
    409: errorJson('Edit window expired or review state changed'),
    422: errorJson('Invalid review update'),
  },
});

const disputeReviewRoute = createRoute({
  method: 'post',
  path: '/{id}/dispute',
  tags: ['Reviews'],
  summary: 'Dispute a published review for the active designer organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth, requireAnyRole(['designer'])] as const,
  request: {
    params: reviewIdParamSchema,
    body: {
      content: { 'application/json': { schema: disputeReviewSchema } },
    },
  },
  responses: {
    200: {
      description: 'Disputed review',
      content: { 'application/json': { schema: reviewResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Designer organization write access required'),
    404: errorJson('Review not found'),
    409: errorJson('Review state changed'),
    422: errorJson('Invalid dispute request'),
  },
});

export const reviewsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listPublishedRoute, async (c) => {
    const result = await reviewsService.listPublished(c.req.valid('query'));
    return c.json(result, 200);
  })
  .openapi(createReviewRoute, async (c) => {
    const result = await reviewsService.create(
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 201);
  })
  .openapi(updateReviewRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await reviewsService.update(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(disputeReviewRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await reviewsService.dispute(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  });

export type ReviewsRoutes = typeof reviewsRoutes;
