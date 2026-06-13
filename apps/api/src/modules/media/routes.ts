import { OpenAPIHono, createRoute, type RouteConfig, type RouteHandler } from '@hono/zod-openapi';
import {
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
  commitUploadResponseSchema,
  listProjectImagesResponseSchema,
  listProjectImagesQuerySchema,
  imageIdParamSchema,
  projectImagesParamSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { mediaService } from './service.js';

type Env = { Variables: AuthVariables };

// Mounted sub-apps don't inherit the base defaultHook; reuse the same {error} envelope (422).
function mediaApp() {
  return new OpenAPIHono<Env>({
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
  });
}

function authedUserId(c: Parameters<RouteHandler<RouteConfig, Env>>[0]): string {
  const user = c.get('user');
  if (!user) throw AppError.unauthorized();
  return user.id;
}

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

const uploadUrlRoute = createRoute({
  method: 'post',
  path: '/upload-url',
  tags: ['Media'],
  summary: 'Mint a presigned upload URL for a project image',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { body: { content: { 'application/json': { schema: uploadUrlRequestSchema } } } },
  responses: {
    201: {
      description: 'Presigned upload URL + created (processing) image id',
      content: { 'application/json': { schema: uploadUrlResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller does not own the project'),
    404: errorJson('Project not found'),
  },
});

const commitRoute = createRoute({
  method: 'post',
  path: '/{imageId}/commit',
  tags: ['Media'],
  summary: 'Commit an uploaded image and enqueue processing',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: imageIdParamSchema },
  responses: {
    202: {
      description: 'Accepted for processing',
      content: { 'application/json': { schema: commitUploadResponseSchema } },
    },
    400: errorJson('No uploaded object found for this image'),
    401: errorJson('Unauthorized'),
    403: errorJson('Caller does not own the image'),
    404: errorJson('Image not found'),
    409: errorJson('Image has already been committed'),
  },
});

export const mediaRoutes = mediaApp()
  .openapi(uploadUrlRoute, async (c) => {
    const result = await mediaService.createUploadUrl({
      ...c.req.valid('json'),
      userId: authedUserId(c),
    });
    return c.json(result, 201);
  })
  .openapi(commitRoute, async (c) => {
    const { imageId } = c.req.valid('param');
    const result = await mediaService.commitUpload({ imageId, userId: authedUserId(c) });
    return c.json(result, 202);
  });

const listImagesRoute = createRoute({
  method: 'get',
  path: '/{id}/images',
  tags: ['Media'],
  summary: "List a project's images with status + derivatives",
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectImagesParamSchema, query: listProjectImagesQuerySchema },
  responses: {
    200: {
      description: 'Images ordered by sortOrder',
      content: { 'application/json': { schema: listProjectImagesResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller does not own the project'),
    404: errorJson('Project not found'),
  },
});

/** Mounted under /api/projects so the path reads /api/projects/:id/images (E-111 contract). */
export const projectImagesRoutes = mediaApp().openapi(listImagesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { limit, offset } = c.req.valid('query');
  const result = await mediaService.listProjectImages({
    projectId: id,
    userId: authedUserId(c),
    limit,
    offset,
  });
  return c.json(result, 200);
});

export type MediaRoutes = typeof mediaRoutes;
