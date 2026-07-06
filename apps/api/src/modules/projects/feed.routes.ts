import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { feedProjectsQuerySchema, feedProjectsResponseSchema } from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { projectsService } from './service.js';

/**
 * Public project feed — the ONLY unauthenticated route in the projects slice.
 * It lives in its own router (mounted at /api/projects before the authed routes)
 * so it can never be swept under auth middleware added to the main router, and so
 * the static `/feed` segment resolves ahead of the authed `GET /{id}`.
 */

const feedRoute = createRoute({
  method: 'get',
  path: '/feed',
  tags: ['Projects'],
  summary: 'Public feed of published projects for the landing page',
  request: { query: feedProjectsQuerySchema },
  responses: {
    200: {
      description: 'A page of published projects',
      content: { 'application/json': { schema: feedProjectsResponseSchema } },
    },
  },
});

export const projectsFeedRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
}).openapi(feedRoute, async (c) => {
  const result = await projectsService.feed(c.req.valid('query'));
  return c.json(result, 200);
});
