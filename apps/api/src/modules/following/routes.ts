import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  discoveryFeedQuerySchema,
  discoveryFeedResponseSchema,
  followingIdParamSchema,
  followingListSchema,
  followingQuerySchema,
  followingSeenSchema,
  followingStateSchema,
} from '@repo/contracts';
import { requireCustomerAccess, type AuthVariables } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { followingService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
const errors = {
  401: errorJson('Unauthorized'),
  403: errorJson('Customer access required or own studio'),
  404: errorJson('Studio not found'),
  422: errorJson('Invalid request'),
};
const stateResponse = {
  200: {
    description: 'Follow state',
    content: { 'application/json': { schema: followingStateSchema } },
  },
  ...errors,
};
const guard = {
  tags: ['Following'],
  security: [{ cookieAuth: [] }],
  middleware: [requireCustomerAccess],
};
const list = createRoute({
  ...guard,
  method: 'get',
  path: '/',
  request: { query: followingQuerySchema },
  responses: {
    200: {
      description: 'Followed active studios',
      content: { 'application/json': { schema: followingListSchema } },
    },
    ...errors,
  },
});
const state = createRoute({
  ...guard,
  method: 'get',
  path: '/{designerProfileId}',
  request: { params: followingIdParamSchema },
  responses: stateResponse,
});
const feed = createRoute({
  ...guard,
  method: 'get',
  path: '/feed',
  request: { query: discoveryFeedQuerySchema },
  responses: {
    200: {
      description: 'Published projects from followed active studios',
      content: { 'application/json': { schema: discoveryFeedResponseSchema } },
    },
    ...errors,
  },
});
const follow = createRoute({
  ...guard,
  method: 'put',
  path: '/{designerProfileId}',
  request: { params: followingIdParamSchema },
  responses: stateResponse,
});
const remove = createRoute({
  ...guard,
  method: 'delete',
  path: '/{designerProfileId}',
  request: { params: followingIdParamSchema },
  responses: stateResponse,
});
const seen = createRoute({
  ...guard,
  method: 'post',
  path: '/{designerProfileId}/seen',
  request: {
    params: followingIdParamSchema,
    body: { content: { 'application/json': { schema: followingSeenSchema } } },
  },
  responses: stateResponse,
});

function userId(user: AuthVariables['user']) {
  if (!user) throw AppError.unauthorized();
  return user.id;
}
export const followingRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(feed, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await followingService.feed(userId(c.get('user')), c.req.valid('query')), 200);
  })
  .openapi(list, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await followingService.list(userId(c.get('user')), c.req.valid('query')), 200);
  })
  .openapi(state, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await followingService.state(userId(c.get('user')), c.req.valid('param').designerProfileId),
      200,
    );
  })
  .openapi(follow, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await followingService.follow(userId(c.get('user')), c.req.valid('param').designerProfileId),
      200,
    );
  })
  .openapi(remove, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await followingService.remove(userId(c.get('user')), c.req.valid('param').designerProfileId),
      200,
    );
  })
  .openapi(seen, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await followingService.seen(
        userId(c.get('user')),
        c.req.valid('param').designerProfileId,
        c.req.valid('json'),
      ),
      200,
    );
  });
