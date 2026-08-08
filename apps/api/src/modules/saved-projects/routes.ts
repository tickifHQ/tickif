import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  savedProjectParamSchema,
  savedProjectStateSchema,
  savedProjectsStateQuerySchema,
  savedProjectsStateResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { savedProjectsService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function callerId(user: AuthVariables['user']): string {
  if (!user) throw AppError.unauthorized();
  return user.id;
}

const stateRoute = createRoute({
  method: 'get',
  path: '/state',
  tags: ['Saved Projects'],
  summary: 'Get saved state for a bounded project batch',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: savedProjectsStateQuerySchema },
  responses: {
    200: {
      description: 'Saved project ids belonging to the caller',
      content: { 'application/json': { schema: savedProjectsStateResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    422: errorJson('Invalid project ids'),
  },
});

const saveRoute = createRoute({
  method: 'put',
  path: '/{projectId}',
  tags: ['Saved Projects'],
  summary: 'Save a published project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: savedProjectParamSchema },
  responses: {
    200: {
      description: 'Project saved',
      content: { 'application/json': { schema: savedProjectStateSchema } },
    },
    401: errorJson('Unauthorized'),
    404: errorJson('Published project not found'),
    422: errorJson('Invalid project id'),
  },
});

const removeRoute = createRoute({
  method: 'delete',
  path: '/{projectId}',
  tags: ['Saved Projects'],
  summary: 'Remove a saved project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: savedProjectParamSchema },
  responses: {
    200: {
      description: 'Project removed from saved projects',
      content: { 'application/json': { schema: savedProjectStateSchema } },
    },
    401: errorJson('Unauthorized'),
    422: errorJson('Invalid project id'),
  },
});

export const savedProjectsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(stateRoute, async (c) => {
    const result = await savedProjectsService.state(
      callerId(c.get('user')),
      c.req.valid('query'),
    );
    return c.json(result, 200);
  })
  .openapi(saveRoute, async (c) => {
    const { projectId } = c.req.valid('param');
    const result = await savedProjectsService.save(callerId(c.get('user')), projectId);
    return c.json(result, 200);
  })
  .openapi(removeRoute, async (c) => {
    const { projectId } = c.req.valid('param');
    const result = await savedProjectsService.remove(callerId(c.get('user')), projectId);
    return c.json(result, 200);
  });

export type SavedProjectsRoutes = typeof savedProjectsRoutes;
