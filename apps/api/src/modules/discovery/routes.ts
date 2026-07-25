import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  projectIdParamSchema,
  similarProjectsResponseSchema,
  discoveryFeedResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import { projectsService } from '../projects/service.js';
import { discoveryService } from './service.js';
import { SEARCH_CACHE_CONTROL } from '../search/cache.js';

/**
 * Discovery HTTP routes (E-195, E-267). Public endpoints — no auth required.
 *
 * - /similar/{id} — similar projects (E-195, delegates to projectsService)
 * - /feed — paginated discovery feed (E-267, delegates to discoveryService)
 *
 * Query parameter arrays use `z.union([string, array])` coercion because Hono
 * passes a single repeated param as a string but multiple as an array.
 */

// ---------------------------------------------------------------------------
// Shared validation primitives
// ---------------------------------------------------------------------------

/** Coerces a single string OR string[] into string[]. Used for repeated query params. */
const coerceStringArray = z
  .union([z.string().transform((v) => [v]), z.array(z.string())])
  .optional();

// ---------------------------------------------------------------------------
// Route-level query schema for feed (with HTTP coercion)
// ---------------------------------------------------------------------------

const discoveryFeedRouteQuerySchema = z
  .object({
    sort: z.enum(['recent', 'featured']).default('recent'),
    citySlug: coerceStringArray,
    localitySlug: coerceStringArray,
    propertyTypeSlug: coerceStringArray,
    propertySubtypeSlug: coerceStringArray,
    scopeSlug: coerceStringArray,
    bhkSlug: coerceStringArray,
    budgetBandSlug: coerceStringArray,
    themes: coerceStringArray,
    materials: coerceStringArray,
    finishes: coerceStringArray,
    roomSlugs: coerceStringArray,
    page: z.coerce.number().int().min(1).max(42).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const feedRoute = createRoute({
  method: 'get',
  path: '/feed',
  tags: ['Discovery'],
  summary: 'Public discovery feed of published projects with sort, filter, and pagination',
  request: { query: discoveryFeedRouteQuerySchema },
  responses: {
    200: {
      description: 'Paginated feed of project cards',
      content: { 'application/json': { schema: discoveryFeedResponseSchema } },
    },
    422: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const discoveryRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(
    createRoute({
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
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const result = await projectsService.similarProjects(id);
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return c.json(result, 200);
    },
  )
  .openapi(feedRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await discoveryService.feed(query);
    c.header('Cache-Control', SEARCH_CACHE_CONTROL);
    return c.json(result, 200);
  });
