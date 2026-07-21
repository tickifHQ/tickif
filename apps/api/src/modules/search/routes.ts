import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  searchResponseSchema,
  suggestQuerySchema,
  suggestResponseSchema,
  designerSearchResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { validationHook } from '../../lib/validation.js';
import { searchService } from './service.js';
import { SEARCH_CACHE_CONTROL } from './cache.js';

/**
 * Search HTTP routes (E-261). Public endpoints — no auth required.
 *
 * Query parameter arrays use `z.union([string, array])` coercion because Hono
 * passes a single repeated param as a string but multiple as an array.
 *
 * The route schemas duplicate filter field definitions (with coercion) rather than
 * deriving from the contract schemas, because Zod v4 does not allow overriding
 * keys on schemas with .refine() via .extend() or .safeExtend(). Non-filter fields
 * (sort enums, pagination) are kept in sync via shared constants below.
 */

// ---------------------------------------------------------------------------
// Shared validation primitives (single source of truth for route + contract)
// ---------------------------------------------------------------------------

/** Coerces a single string OR string[] into string[]. Used for repeated query params. */
const coerceStringArray = z
  .union([z.string().transform((v) => [v]), z.array(z.string())])
  .optional();

const PROJECT_SORT_ENUM = ['relevance', 'publishedAt:desc', 'publishedAt:asc', 'sizeSqft:asc', 'sizeSqft:desc'] as const;
const DESIGNER_SORT_ENUM = ['relevance', 'avgRating:desc', 'projectCount:desc', 'reviewCount:desc', 'yearsExperience:desc'] as const;
const PAGINATION_MAX_WINDOW = 1000;

// ---------------------------------------------------------------------------
// Route-level query schemas (with HTTP coercion + cross-field refine)
// ---------------------------------------------------------------------------

const searchRouteQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
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
    sort: z.enum(PROJECT_SORT_ENUM).default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((data) => data.page * data.limit <= PAGINATION_MAX_WINDOW, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  });

const designerSearchRouteQuerySchema = z
  .object({
    q: z.string().max(200).default(''),
    citySlugs: coerceStringArray,
    localitySlugs: coerceStringArray,
    scopeSlugs: coerceStringArray,
    themeSlugs: coerceStringArray,
    entityType: z.enum(['individual', 'company']).optional(),
    sort: z.enum(DESIGNER_SORT_ENUM).default('relevance'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .refine((data) => data.page * data.limit <= PAGINATION_MAX_WINDOW, {
    message: 'Maximum pagination window exceeded',
    path: ['page'],
  });

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const searchRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Search'],
  summary: 'Search published projects with filters, sort, and pagination',
  request: { query: searchRouteQuerySchema },
  responses: {
    200: {
      description: 'Search results with hits, facets, and fallback metadata',
      content: { 'application/json': { schema: searchResponseSchema } },
    },
    422: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const suggestRoute = createRoute({
  method: 'get',
  path: '/suggest',
  tags: ['Search'],
  summary: 'Blended suggest: top projects + top designers',
  request: { query: suggestQuerySchema },
  responses: {
    200: {
      description: 'Blended suggest results',
      content: { 'application/json': { schema: suggestResponseSchema } },
    },
    422: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const designerSearchRoute = createRoute({
  method: 'get',
  path: '/designers',
  tags: ['Search'],
  summary: 'Search active designers with filters, sort, and pagination',
  request: { query: designerSearchRouteQuerySchema },
  responses: {
    200: {
      description: 'Designer search results',
      content: { 'application/json': { schema: designerSearchResponseSchema } },
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

export const searchRoutes = new OpenAPIHono({ defaultHook: validationHook })
  .openapi(searchRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await searchService.search(query);
    c.header('Cache-Control', SEARCH_CACHE_CONTROL);
    return c.json(result, 200);
  })
  .openapi(suggestRoute, async (c) => {
    const { q } = c.req.valid('query');
    const result = await searchService.suggest(q);
    c.header('Cache-Control', SEARCH_CACHE_CONTROL);
    return c.json(result, 200);
  })
  .openapi(designerSearchRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await searchService.searchDesigners(query);
    c.header('Cache-Control', SEARCH_CACHE_CONTROL);
    return c.json(result, 200);
  });
