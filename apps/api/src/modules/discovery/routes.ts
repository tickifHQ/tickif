import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  projectIdParamSchema,
  similarProjectsResponseSchema,
  discoveryFeedQuerySchema,
  discoveryFeedResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import { projectsService } from '../projects/service.js';
import { discoveryService } from './service.js';

/**
 * Discovery routes (E-195, E-267). Thin routing layer — business logic lives in
 * the service layer. Exposed at /api/discovery per the issue specs.
 *
 * Design Invariant 2: Routes own HTTP concerns only (validation, cache headers).
 * NO fallback logic here — fallback decisions are owned by the service layer.
 */

const FEED_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120';

const feedRoute = createRoute({
  method: 'get',
  path: '/feed',
  tags: ['Discovery'],
  summary: 'Public discovery feed of published projects',
  request: { query: discoveryFeedQuerySchema },
  responses: {
    200: {
      description: 'A page of discovery cards',
      content: { 'application/json': { schema: discoveryFeedResponseSchema } },
    },
    422: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const similarRoute = createRoute({
  method: 'get',
  path: '/similar/{id}',
  tags: ['Discovery'],
  summary: 'Similar published projects (same city + bhk + budget band + scope)',
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Up to 8 similar published projects',
      content: { 'application/json': { schema: similarProjectsResponseSchema } },
    },
    404: {
      description: 'Source project not found or not published',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const discoveryRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(feedRoute, async (c) => {
    const result = await discoveryService.getFeed(c.req.valid('query'));
    c.header('Cache-Control', FEED_CACHE_CONTROL);
    return c.json(result, 200);
  })
  .openapi(similarRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.similarProjects(id);
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return c.json(result, 200);
  });

export type DiscoveryRoutes = typeof discoveryRoutes;
