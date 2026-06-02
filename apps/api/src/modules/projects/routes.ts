import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createProjectSchema,
  projectResponseSchema,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  projectIdParamSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { projectsService } from './service.js';

/**
 * Projects HTTP routes — the ONLY layer that touches Hono. Routes validate via
 * shared contracts, delegate to the service, and never contain business logic.
 * Each `.openapi()` call also contributes to the generated OpenAPI spec.
 */

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Projects'],
  summary: 'List projects',
  request: { query: listProjectsQuerySchema },
  responses: {
    200: {
      description: 'A page of projects',
      content: { 'application/json': { schema: listProjectsResponseSchema } },
    },
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Get a project by id',
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'The project',
      content: { 'application/json': { schema: projectResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Projects'],
  summary: 'Create a project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: createProjectSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created project',
      content: { 'application/json': { schema: projectResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const projectsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(listRoute, async (c) => {
    const result = await projectsService.list(c.req.valid('query'));
    return c.json(result, 200);
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const project = await projectsService.getById(id);
    return c.json(project, 200);
  })
  .openapi(createProjectRoute, async (c) => {
    const project = await projectsService.create(c.req.valid('json'));
    return c.json(project, 201);
  });

export type ProjectsRoutes = typeof projectsRoutes;
