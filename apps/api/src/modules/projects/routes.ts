import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createProjectRoomSchema,
  createProjectSchema,
  deleteProjectResponseSchema,
  deleteProjectRoomResponseSchema,
  linkProjectImageSchema,
  listProjectRoomsResponseSchema,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  projectDetailResponseSchema,
  projectImageAttachmentSchema,
  projectImageIdParamSchema,
  projectIdParamSchema,
  projectRoomIdParamSchema,
  projectRoomSchema,
  reorderProjectRoomsSchema,
  updateProjectRoomSchema,
  updateProjectSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
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

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

function caller(user: AuthVariables['user']) {
  if (!user) throw AppError.unauthorized();
  const isBanned = !!user.banned && (!user.banExpires || user.banExpires > new Date());
  return { userId: user.id, userRole: user.role ?? '', isBanned };
}

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Get a project by id, including rooms',
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'The project',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    403: errorJson('Caller cannot read this draft'),
    404: errorJson('Not found'),
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
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Designer profile required'),
    422: errorJson('Invalid taxonomy refs'),
  },
});

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Update an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: projectIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateProjectSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated project',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft projects can be edited'),
    422: errorJson('Invalid taxonomy refs or cover image'),
  },
});

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Delete an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Deleted project',
      content: { 'application/json': { schema: deleteProjectResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot delete this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft projects can be deleted'),
  },
});

const listRoomsRoute = createRoute({
  method: 'get',
  path: '/{id}/rooms',
  tags: ['Projects'],
  summary: 'List rooms for an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Project rooms ordered by sortOrder',
      content: { 'application/json': { schema: listProjectRoomsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot read these rooms'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft project rooms can be edited'),
  },
});

const createRoomRoute = createRoute({
  method: 'post',
  path: '/{id}/rooms',
  tags: ['Projects'],
  summary: 'Create a room in an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: projectIdParamSchema,
    body: {
      content: { 'application/json': { schema: createProjectRoomSchema } },
    },
  },
  responses: {
    201: {
      description: 'Created room',
      content: { 'application/json': { schema: projectRoomSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft projects can be edited'),
    422: errorJson('Invalid room type'),
  },
});

const reorderRoomsRoute = createRoute({
  method: 'patch',
  path: '/{id}/rooms/reorder',
  tags: ['Projects'],
  summary: 'Reorder rooms in an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: projectIdParamSchema,
    body: {
      content: { 'application/json': { schema: reorderProjectRoomsSchema } },
    },
  },
  responses: {
    200: {
      description: 'Reordered rooms',
      content: { 'application/json': { schema: listProjectRoomsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft projects can be edited'),
    422: errorJson('Invalid room ordering'),
  },
});

const updateRoomRoute = createRoute({
  method: 'patch',
  path: '/{id}/rooms/{roomId}',
  tags: ['Projects'],
  summary: 'Update a room in an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: projectRoomIdParamSchema,
    body: {
      content: { 'application/json': { schema: updateProjectRoomSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated room',
      content: { 'application/json': { schema: projectRoomSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project or room not found'),
    409: errorJson('Only draft projects can be edited'),
    422: errorJson('Invalid room type'),
  },
});

const deleteRoomRoute = createRoute({
  method: 'delete',
  path: '/{id}/rooms/{roomId}',
  tags: ['Projects'],
  summary: 'Delete a room from an owned project draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectRoomIdParamSchema },
  responses: {
    200: {
      description: 'Deleted room',
      content: { 'application/json': { schema: deleteProjectRoomResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project or room not found'),
    409: errorJson('Only draft projects can be edited'),
  },
});

const linkImageRoute = createRoute({
  method: 'patch',
  path: '/{id}/images/{imageId}',
  tags: ['Projects'],
  summary: 'Attach a project image to a room or reorder it',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    params: projectImageIdParamSchema,
    body: {
      content: { 'application/json': { schema: linkProjectImageSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated image link',
      content: { 'application/json': { schema: projectImageAttachmentSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project or image not found'),
    409: errorJson('Only draft projects can be edited'),
    422: errorJson('Room must belong to project'),
  },
});

export const projectsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(listRoute, async (c) => {
    const result = await projectsService.list(c.req.valid('query'));
    return c.json(result, 200);
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user');
    const project = await projectsService.getById(id, user ? caller(user) : undefined);
    return c.json(project, 200);
  })
  .openapi(createProjectRoute, async (c) => {
    const project = await projectsService.create(c.req.valid('json'), caller(c.get('user')));
    return c.json(project, 201);
  })
  .openapi(updateProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const project = await projectsService.update(id, c.req.valid('json'), caller(c.get('user')));
    return c.json(project, 200);
  })
  .openapi(deleteProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.delete(id, caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(listRoomsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.listRooms(id, caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(createRoomRoute, async (c) => {
    const { id } = c.req.valid('param');
    const room = await projectsService.createRoom(id, c.req.valid('json'), caller(c.get('user')));
    return c.json(room, 201);
  })
  .openapi(reorderRoomsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.reorderRooms(id, c.req.valid('json'), caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(updateRoomRoute, async (c) => {
    const { id, roomId } = c.req.valid('param');
    const room = await projectsService.updateRoom(
      id,
      roomId,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(room, 200);
  })
  .openapi(deleteRoomRoute, async (c) => {
    const { id, roomId } = c.req.valid('param');
    const result = await projectsService.deleteRoom(id, roomId, caller(c.get('user')));
    return c.json(result, 200);
  })
  .openapi(linkImageRoute, async (c) => {
    const { id, imageId } = c.req.valid('param');
    const result = await projectsService.linkImage(
      id,
      imageId,
      c.req.valid('json'),
      caller(c.get('user')),
    );
    return c.json(result, 200);
  });

export type ProjectsRoutes = typeof projectsRoutes;
