import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  listTaxonomyResponseSchema,
  listTaxonomyQuerySchema,
  errorResponseSchema,
  createRoomTypeSchema,
  taxonomyTermSchema,
} from '@repo/contracts';
import { taxonomyService } from './service.js';
import { requireAnyRole, type AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';

/**
 * Taxonomy public read routes.
 * Public, unauthenticated, aggressively cached.
 */

/** Seeded vocabularies can be cached; designer-created rooms are revalidated. */
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

const createRoomRoute = createRoute({
  method: 'post',
  path: '/rooms',
  tags: ['Taxonomy'],
  summary: 'Create a room type',
  middleware: [requireAnyRole(['designer'])] as const,
  request: { body: { content: { 'application/json': { schema: createRoomTypeSchema } } } },
  responses: {
    200: {
      description: 'Room type available for tagging and search',
      content: { 'application/json': { schema: taxonomyTermSchema } },
    },
    400: {
      description: 'Room name cannot form a slug',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    409: {
      description: 'Room type is unavailable',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Authentication required',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'Designer access required',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Invalid room name',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const taxonomyRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(createRoomRoute, async (c) =>
    c.json(await taxonomyService.createRoom(c.req.valid('json')), 200),
  )
  .openapi(listRoute, async (c) => {
    const { kind, parentId } = c.req.valid('query');
    const result = await taxonomyService.list(kind, parentId);
    // Only long-cache non-empty results. Empty responses get a short cache so
    // later seeds surface without waiting 7 days.
    if (kind === 'room') {
      c.header('Cache-Control', 'no-cache');
    } else if (result.terms.length > 0) {
      c.header('Cache-Control', CACHE_CONTROL);
    } else {
      c.header('Cache-Control', 'public, max-age=60');
    }
    return c.json(result, 200);
  });

export type TaxonomyRoutes = typeof taxonomyRoutes;
