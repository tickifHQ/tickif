import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createLocationSchema,
  createLocationResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import { requireAnyRole, type AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { locationsService } from './locations-service.js';

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
}).openapi(createLocationRoute, async (c) =>
  c.json(await locationsService.create(c.req.valid('json')), 200),
);
