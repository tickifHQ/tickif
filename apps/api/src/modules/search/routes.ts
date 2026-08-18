import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  searchProjectsQuerySchema,
  searchProjectsResponseSchema,
  searchDesignersQuerySchema,
  searchDesignersResponseSchema,
  searchSuggestQuerySchema,
  searchSuggestResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import * as searchService from './service.js';

/**
 * Search HTTP routes — public endpoints for project search, designer search,
 * and blended suggest (autocomplete). Routes validate via shared contracts,
 * delegate to the service layer, and set cache headers. No business logic here.
 */

const CACHE_HEADER = 'public, max-age=30, stale-while-revalidate=120';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions
// ─────────────────────────────────────────────────────────────────────────────

const searchProjectsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Search'],
  summary: 'Search published projects with faceted filtering',
  request: { query: searchProjectsQuerySchema },
  responses: {
    200: {
      description: 'Search results with facet distribution',
      content: { 'application/json': { schema: searchProjectsResponseSchema } },
    },
    422: errorJson('Validation error'),
  },
});

const searchDesignersRoute = createRoute({
  method: 'get',
  path: '/designers',
  tags: ['Search'],
  summary: 'Search designers with faceted filtering',
  request: { query: searchDesignersQuerySchema },
  responses: {
    200: {
      description: 'Designer search results with facet distribution',
      content: { 'application/json': { schema: searchDesignersResponseSchema } },
    },
    422: errorJson('Validation error'),
  },
});

const searchSuggestRoute = createRoute({
  method: 'get',
  path: '/suggest',
  tags: ['Search'],
  summary: 'Blended suggest (autocomplete) for projects and designers',
  request: { query: searchSuggestQuerySchema },
  responses: {
    200: {
      description: 'Blended suggest results with projects and designers',
      content: { 'application/json': { schema: searchSuggestResponseSchema } },
    },
    422: errorJson('Validation error'),
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAPIHono App + Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

export const searchRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(searchProjectsRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await searchService.searchProjects(query);

    c.header('Cache-Control', CACHE_HEADER);

    return c.json(result, 200);
  })
  .openapi(searchDesignersRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await searchService.searchDesigners(query);

    c.header('Cache-Control', CACHE_HEADER);

    return c.json(result, 200);
  })
  .openapi(searchSuggestRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await searchService.suggest(query);

    c.header('Cache-Control', CACHE_HEADER);

    return c.json(result, 200);
  });
