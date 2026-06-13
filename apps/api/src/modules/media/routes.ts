import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { mediaService } from './service.js';

const uploadUrlRoute = createRoute({
  method: 'post',
  path: '/upload-url',
  tags: ['Media'],
  summary: 'Mint a presigned upload URL for a project image',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: uploadUrlRequestSchema } },
    },
  },
  responses: {
    201: {
      description: 'Presigned upload URL + created (processing) image id',
      content: { 'application/json': { schema: uploadUrlResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'Caller does not own the project',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Project not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const mediaRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  // Mounted sub-apps don't inherit the base defaultHook, so map validation
  // failures to the same {error} envelope (422) here too.
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'Request validation failed',
            details: result.error.issues,
          },
        },
        422,
      );
    }
  },
}).openapi(
  uploadUrlRoute,
  async (c) => {
    const user = c.get('user');
    if (!user) throw AppError.unauthorized();
    const result = await mediaService.createUploadUrl({
      ...c.req.valid('json'),
      userId: user.id,
    });
    return c.json(result, 201);
  },
);

export type MediaRoutes = typeof mediaRoutes;
