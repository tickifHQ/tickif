import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema, projectLikeParamSchema, projectLikeStateSchema,
  projectLikesStateQuerySchema, projectLikesStateResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth, requirePersonalContext, withFreshSession } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { projectLikesService } from './service.js';

const errorJson = (description: string) => ({
  description, content: { 'application/json': { schema: errorResponseSchema } },
});

const stateRoute = createRoute({
  method: 'get', path: '/state', tags: ['Project Likes'],
  summary: 'Public counts and caller-only like state for up to 48 visible projects',
  middleware: [withFreshSession] as const,
  request: { query: projectLikesStateQuerySchema },
  responses: {
    200: { description: 'Visible project like states', content: { 'application/json': { schema: projectLikesStateResponseSchema } } },
    422: errorJson('Invalid project ids'),
  },
});

const mutationRoute = <Method extends 'put' | 'delete'>(method: Method) => createRoute({
  method, path: '/{projectId}', tags: ['Project Likes'],
  summary: method === 'put' ? 'Like a public project idempotently' : 'Unlike a public project idempotently',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth, requirePersonalContext] as const,
  request: { params: projectLikeParamSchema },
  responses: {
    200: { description: 'Current project like state', content: { 'application/json': { schema: projectLikeStateSchema } } },
    401: errorJson('Unauthorized'),
    403: errorJson('Account suspended or personal context required'),
    404: errorJson('Public project not found'),
    422: errorJson('Invalid project id'),
  },
});

function callerId(user: AuthVariables['user']): string {
  if (!user) throw AppError.unauthorized();
  return user.id;
}

export const projectLikesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook })
  .openapi(stateRoute, async (c) => {
    c.header('Cache-Control', 'private, no-store');
    const result = await projectLikesService.state(c.get('user')?.id ?? null, c.req.valid('query'));
    return c.json(result, 200);
  })
  .openapi(mutationRoute('put'), async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await projectLikesService.setLiked(callerId(c.get('user')), c.req.valid('param').projectId, true), 200);
  })
  .openapi(mutationRoute('delete'), async (c) => {
    c.header('Cache-Control', 'private, no-store');
    return c.json(await projectLikesService.setLiked(callerId(c.get('user')), c.req.valid('param').projectId, false), 200);
  });
