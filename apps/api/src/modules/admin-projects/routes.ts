import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  adminCorrectProjectSchema,
  adminModerationDetailResponseSchema,
  adminModerationQueueQuerySchema,
  adminModerationQueueResponseSchema,
  errorResponseSchema,
  moderationNoteSchema,
  projectIdParamSchema,
  rejectProjectSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAnyRole, requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { adminProjectsService } from './service.js';

const adminMiddleware = [requireAuth, requireAnyRole(['admin'])];

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user']) {
  if (!user) throw AppError.unauthorized();
  return {
    userId: user.id,
    userRole: user.role ?? '',
    isBanned: !!user.banned && (!user.banExpires || user.banExpires > new Date()),
  };
}

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Admin Projects'],
  summary: 'List the project moderation queue',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { query: adminModerationQueueQuerySchema },
  responses: {
    200: {
      description: 'A page of projects awaiting moderation',
      content: { 'application/json': { schema: adminModerationQueueResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Admin Projects'],
  summary: 'Get full project moderation detail',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Project review detail with original image links',
      content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Project not found'),
  },
});

const startReviewRoute = createRoute({
  method: 'post',
  path: '/{id}/start-review',
  tags: ['Admin Projects'],
  summary: 'Claim a submitted project for review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Claimed project',
      content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Project not found'),
    409: errorJson('Project state changed or cannot enter review'),
  },
});

const publishRoute = createRoute({
  method: 'post',
  path: '/{id}/publish',
  tags: ['Admin Projects'],
  summary: 'Publish a project in review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Published project',
      content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Project not found'),
    409: errorJson('Project state changed or cannot be published'),
  },
});

function noteRoute(path: '/{id}/request-changes' | '/{id}/unpublish', summary: string) {
  return createRoute({
    method: 'post',
    path,
    tags: ['Admin Projects'],
    summary,
    security: [{ cookieAuth: [] }],
    middleware: adminMiddleware,
    request: {
      params: projectIdParamSchema,
      body: { content: { 'application/json': { schema: moderationNoteSchema } } },
    },
    responses: {
      200: {
        description: 'Updated project moderation state',
        content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
      },
      401: errorJson('Unauthorized'),
      403: errorJson('Admin role required'),
      404: errorJson('Project not found'),
      409: errorJson('Project state changed or transition is not allowed'),
      422: errorJson('A moderation note is required'),
    },
  });
}

const requestChangesRoute = noteRoute(
  '/{id}/request-changes',
  'Return a project to the designer with requested changes',
);
const unpublishRoute = noteRoute('/{id}/unpublish', 'Unpublish a project and return it to review');

const rejectRoute = createRoute({
  method: 'post',
  path: '/{id}/reject',
  tags: ['Admin Projects'],
  summary: 'Reject a project in review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: projectIdParamSchema,
    body: { content: { 'application/json': { schema: rejectProjectSchema } } },
  },
  responses: {
    200: {
      description: 'Rejected project',
      content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Project not found'),
    409: errorJson('Project state changed or cannot be rejected'),
    422: errorJson('A note and reason code are required'),
  },
});

const correctRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Admin Projects'],
  summary: 'Correct allowlisted project metadata during review',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: projectIdParamSchema,
    body: { content: { 'application/json': { schema: adminCorrectProjectSchema } } },
  },
  responses: {
    200: {
      description: 'Corrected project review detail',
      content: { 'application/json': { schema: adminModerationDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Admin role required'),
    404: errorJson('Project not found'),
    409: errorJson('Metadata can only be corrected while a project is in review'),
    422: errorJson('Invalid correction fields or taxonomy'),
  },
});

export const adminProjectsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listRoute, async (c) => {
    const result = await adminProjectsService.list(c.req.valid('query'), caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(startReviewRoute, async (c) => {
    const result = await adminProjectsService.startReview(
      c.req.valid('param').id,
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(publishRoute, async (c) => {
    const result = await adminProjectsService.publish(
      c.req.valid('param').id,
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(requestChangesRoute, async (c) => {
    const result = await adminProjectsService.requestChanges(
      c.req.valid('param').id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(rejectRoute, async (c) => {
    const result = await adminProjectsService.reject(
      c.req.valid('param').id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(unpublishRoute, async (c) => {
    const result = await adminProjectsService.unpublish(
      c.req.valid('param').id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(correctRoute, async (c) => {
    const result = await adminProjectsService.correct(
      c.req.valid('param').id,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  })
  .openapi(getRoute, async (c) => {
    const result = await adminProjectsService.getById(c.req.valid('param').id);
    return c.json(result, 200);
  });

export type AdminProjectsRoutes = typeof adminProjectsRoutes;
