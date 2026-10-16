import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createLocationSchema,
  createLocationResponseSchema,
  errorResponseSchema,
  nearbyLocationSchema,
  nearbyLocationResponseSchema,
} from '@repo/contracts';
import { requireAnyRole, type AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { locationsService } from './locations-service.js';
import { findNearbyLocation } from './nearby-service.js';

const nearbyLocationRoute = createRoute({
  method: 'post',
  path: '/locations/nearby',
  tags: ['Taxonomy'],
  summary: 'Resolve a device location to an existing city for discovery',
  request: { body: { content: { 'application/json': { schema: nearbyLocationSchema } } } },
  responses: {
    200: {
      description: 'City for nearby search',
      content: { 'application/json': { schema: nearbyLocationResponseSchema } },
    },
    404: {
      description: 'No matching city',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Invalid coordinates',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    429: {
      description: 'Lookup budget exhausted',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    502: {
      description: 'Location provider unavailable',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    503: {
      description: 'Near me unavailable',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const createLocationRoute = createRoute({
  method: 'post',
  path: '/locations',
  tags: ['Taxonomy'],
  summary: 'Create a reusable city or locality',
  middleware: [requireAnyRole(['designer'])] as const,
  request: { body: { content: { 'application/json': { schema: createLocationSchema } } } },
  responses: {
    200: {
      description: 'Active city and optional locality',
      content: { 'application/json': { schema: createLocationResponseSchema } },
    },
    401: {
      description: 'Authentication required',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'Designer access required',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    409: {
      description: 'Location is inactive',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Invalid location',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});
export const locationsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(nearbyLocationRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await findNearbyLocation(c.req.valid('json')), 200);
  })
  .openapi(createLocationRoute, async (c) =>
    c.json(await locationsService.create(c.req.valid('json')), 200),
  );
