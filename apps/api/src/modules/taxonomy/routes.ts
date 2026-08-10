import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { listTaxonomyResponseSchema, listTaxonomyQuerySchema, errorResponseSchema } from '@repo/contracts';
import { taxonomyService } from './service.js';
import { validationHook } from '../../lib/validation.js';

/**
 * Taxonomy public read routes.
 * Public, unauthenticated, aggressively cached.
 */

/** Taxonomy only changes on deploy/seed — cache for 7 days. */
const CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400';

const listRoute = createRoute({
  method: 'get',
  path: '/terms',
  tags: ['Taxonomy'],
  summary: 'List active taxonomy terms by kind',
  request: { query: listTaxonomyQuerySchema },
  responses: {
    200: {
      description: 'Active taxonomy terms',
      content: { 'application/json': { schema: listTaxonomyResponseSchema } },
    },
    422: {
      description: 'Invalid parentId format',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const taxonomyRoutes = new OpenAPIHono({ defaultHook: validationHook }).openapi(listRoute, async (c) => {
  const { kind, parentId } = c.req.valid('query');
  const result = await taxonomyService.list(kind, parentId);
  // Only long-cache non-empty results. Empty responses get a short cache so
  // later seeds surface without waiting 7 days.
  if (result.terms.length > 0) {
    c.header('Cache-Control', CACHE_CONTROL);
  } else {
    c.header('Cache-Control', 'public, max-age=60');
  }
  return c.json(result, 200);
});

export type TaxonomyRoutes = typeof taxonomyRoutes;
