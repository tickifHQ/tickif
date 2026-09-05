import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createProjectRoomSchema,
  createProjectSchema,
  deleteProjectImageResponseSchema,
  deleteProjectResponseSchema,
  deleteProjectRoomResponseSchema,
  duplicateProjectResponseSchema,
  feedProjectsQuerySchema,
  feedProjectsResponseSchema,
  galleryResponseSchema,
  linkProjectImageSchema,
  listProjectRoomsResponseSchema,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  moderationHistoryResponseSchema,
  portfolioProjectsQuerySchema,
  portfolioProjectsResponseSchema,
  projectCompletenessResponseSchema,
  projectDetailResponseSchema,
  publicImageDetailParamSchema,
  publicImageDetailResponseSchema,
  publicProjectPageResponseSchema,
  projectImageAttachmentSchema,
  projectImageIdParamSchema,
  projectIdParamSchema,
  projectRoomIdParamSchema,
  projectRoomSchema,
  projectReviewCommentsResponseSchema,
  projectSlugParamSchema,
  publicProjectBySlugResponseSchema,
  reorderProjectRoomsSchema,
  updateProjectRoomSchema,
  updateProjectSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth, withFreshSession } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { projectsService } from './service.js';

/**
 * Projects HTTP routes — the ONLY layer that touches Hono. Routes validate via
 * shared contracts, delegate to the service, and never contain business logic.
 * Each `.openapi()` call also contributes to the generated OpenAPI spec.
 */

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

const listRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Projects'],
  summary: 'List projects owned by the active organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: listProjectsQuerySchema },
  responses: {
    200: {
      description: 'A page of projects',
      content: { 'application/json': { schema: listProjectsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot list these projects'),
    422: errorJson('No active organization selected'),
  },
});

function caller(user: AuthVariables['user'], session?: AuthVariables['session']) {
  if (!user) throw AppError.unauthorized();
  const isBanned = !!user.banned && (!user.banExpires || user.banExpires > new Date());
  return {
    userId: user.id,
    userRole: user.role ?? '',
    isBanned,
    activeOrgId: session?.activeOrganizationId ?? null,
    activeTeamId: session?.activeTeamId ?? null,
  };
}

// Public, unauthenticated. Registered before `getRoute` so the static `/feed`
// segment resolves ahead of the `/{id}` param route.
const feedRoute = createRoute({
  method: 'get',
  path: '/feed',
  tags: ['Projects'],
  summary: 'Public feed of published projects for the landing page',
  request: { query: feedProjectsQuerySchema },
  responses: {
    200: {
      description: 'A page of published projects',
      content: { 'application/json': { schema: feedProjectsResponseSchema } },
    },
  },
});

const portfolioRoute = createRoute({
  method: 'get',
  path: '/portfolio',
  tags: ['Projects'],
  summary: 'List portfolio-ready projects for the active designer organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { query: portfolioProjectsQuerySchema },
  responses: {
    200: {
      description: 'Portfolio project summaries and status counts',
      content: { 'application/json': { schema: portfolioProjectsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot list these portfolio projects'),
  },
});

// Optional auth: anonymous callers may read a published project, so this route
// cannot use `requireAuth`. It still decides draft visibility from the caller's
// ban/role (`assertAccess` in the service), so the session must not come from the
// ≤5-min cookie cache — `withFreshSession` refreshes it without 401ing anonymous
// readers.
const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Get a project by id, including rooms',
  middleware: [withFreshSession] as const,
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

const publicProjectByIdRoute = createRoute({
  method: 'get',
  path: '/public/{id}',
  tags: ['Projects'],
  summary: 'Public project detail by id (published only)',
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description:
        'Published project read model with rooms, gallery, designer, and recommendations',
      content: { 'application/json': { schema: publicProjectPageResponseSchema } },
    },
    404: errorJson('Project not found or not published'),
    410: errorJson('Project permanently deleted'),
  },
});

const publicProjectStatusRoute = createRoute({
  method: 'head',
  path: '/public/{id}',
  tags: ['Projects'],
  summary: 'Check whether a retained public project URL is permanently gone',
  request: { params: projectIdParamSchema },
  responses: {
    204: { description: 'The project URL is not permanently gone' },
    410: errorJson('Project permanently deleted'),
  },
});

const createProjectRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Projects'],
  summary: 'Create an editable project',
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
    403: errorJson('Designer role, organization write access, and profile required'),
    422: errorJson('No active organization or invalid taxonomy refs'),
  },
});

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Update an owned editable project',
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
    422: errorJson('Invalid taxonomy refs or cover image'),
  },
});

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Projects'],
  summary: 'Mark an owned project deleted while retaining its audit data',
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
    409: errorJson('Project is already deleted or governed by organization retention'),
  },
});

const archiveProjectRoute = createRoute({
  method: 'post',
  path: '/{id}/archive',
  tags: ['Projects'],
  summary: 'Archive an owned draft or published project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Archived project',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot archive this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft or published projects can be archived'),
  },
});

const restoreProjectRoute = createRoute({
  method: 'post',
  path: '/{id}/restore',
  tags: ['Projects'],
  summary: 'Restore an archived project to draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Restored project draft',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot restore this project'),
    404: errorJson('Project not found'),
    409: errorJson('Project is not archived'),
  },
});

const duplicateProjectRoute = createRoute({
  method: 'post',
  path: '/{id}/duplicate',
  tags: ['Projects'],
  summary: 'Duplicate an owned project into a fresh draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    201: {
      description: 'Duplicated project draft',
      content: { 'application/json': { schema: duplicateProjectResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot duplicate this project'),
    404: errorJson('Project not found'),
  },
});

const listRoomsRoute = createRoute({
  method: 'get',
  path: '/{id}/rooms',
  tags: ['Projects'],
  summary: 'List rooms for an owned editable project',
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
    409: errorJson('Only editable project rooms can be edited'),
  },
});

const createRoomRoute = createRoute({
  method: 'post',
  path: '/{id}/rooms',
  tags: ['Projects'],
  summary: 'Create a room in an owned editable project',
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
    422: errorJson('Invalid room type'),
  },
});

const reorderRoomsRoute = createRoute({
  method: 'patch',
  path: '/{id}/rooms/reorder',
  tags: ['Projects'],
  summary: 'Reorder rooms in an owned editable project',
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
    422: errorJson('Invalid room ordering'),
  },
});

const updateRoomRoute = createRoute({
  method: 'patch',
  path: '/{id}/rooms/{roomId}',
  tags: ['Projects'],
  summary: 'Update a room in an owned editable project',
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
    422: errorJson('Invalid room type'),
  },
});

const deleteRoomRoute = createRoute({
  method: 'delete',
  path: '/{id}/rooms/{roomId}',
  tags: ['Projects'],
  summary: 'Delete a room from an owned editable project',
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
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
    409: errorJson('Only draft or changes-requested projects can be edited'),
    422: errorJson('Room must belong to project'),
  },
});

const deleteImageRoute = createRoute({
  method: 'delete',
  path: '/{id}/images/{imageId}',
  tags: ['Projects'],
  summary: 'Delete an image from an owned editable project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectImageIdParamSchema },
  responses: {
    200: {
      description: 'Deleted image',
      content: { 'application/json': { schema: deleteProjectImageResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot edit this project'),
    404: errorJson('Project or image not found'),
    409: errorJson('Only draft or changes-requested projects can be edited'),
  },
});

const completenessRoute = createRoute({
  method: 'get',
  path: '/{id}/completeness',
  tags: ['Projects'],
  summary: 'Get project upload completeness',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Project completeness requirements',
      content: { 'application/json': { schema: projectCompletenessResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot read this project'),
    404: errorJson('Project not found'),
  },
});

const submitRoute = createRoute({
  method: 'post',
  path: '/{id}/submit',
  tags: ['Projects'],
  summary: 'Submit or resubmit a complete project for review',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Submitted project',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot submit this project'),
    404: errorJson('Project not found'),
    409: errorJson('Only draft or changes-requested projects can be submitted'),
    422: errorJson('Project is missing required upload information'),
  },
});

const withdrawRoute = createRoute({
  method: 'post',
  path: '/{id}/withdraw',
  tags: ['Projects'],
  summary: 'Withdraw an owned submitted project back to draft',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Withdrawn project',
      content: { 'application/json': { schema: projectDetailResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot withdraw this project'),
    404: errorJson('Project not found'),
    409: errorJson('Project is not submitted or changed concurrently'),
  },
});

const moderationHistoryRoute = createRoute({
  method: 'get',
  path: '/{id}/moderation-history',
  tags: ['Projects'],
  summary: 'Get moderation history for an owned project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Project moderation history',
      content: { 'application/json': { schema: moderationHistoryResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot read this moderation history'),
    404: errorJson('Project not found'),
  },
});

const reviewCommentsRoute = createRoute({
  method: 'get',
  path: '/{id}/review-comments',
  tags: ['Projects'],
  summary: 'List review comments for an owned project',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: { params: projectIdParamSchema },
  responses: {
    200: {
      description: 'Project review comments',
      content: { 'application/json': { schema: projectReviewCommentsResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller cannot read these review comments'),
    404: errorJson('Project not found'),
  },
});

export const projectsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(feedRoute, async (c) => {
    const result = await projectsService.feed(c.req.valid('query'));
    // Hot anonymous path: let shared caches absorb bursts. TTL stays well inside the
    // presigned cover URLs' validity so cached JSON never points at expired signatures.
    c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return c.json(result, 200);
  })
  .openapi(
    createRoute({
      method: 'get',
      path: '/{id}/gallery',
      tags: ['Projects'],
      summary: 'Public gallery: all processed images for a published project',
      request: { params: projectIdParamSchema },
      responses: {
        200: {
          description: 'Gallery images with presigned URLs',
          content: { 'application/json': { schema: galleryResponseSchema } },
        },
        404: errorJson('Project not found or not published'),
        410: errorJson('Project permanently deleted'),
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const images = await projectsService.getGallery(id);
      c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return c.json({ images }, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/images/{imageId}',
      tags: ['Projects'],
      summary: 'Public image detail by image id',
      request: { params: publicImageDetailParamSchema },
      responses: {
        200: {
          description:
            'Display-ready published project, designer, gallery, active image, and recommendations',
          content: { 'application/json': { schema: publicImageDetailResponseSchema } },
        },
        404: errorJson('Image not found or not published'),
      },
    }),
    async (c) => {
      const { imageId } = c.req.valid('param');
      const result = await projectsService.getPublicImageDetail(imageId);
      c.header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return c.json(result, 200);
    },
  )
  .openapi(portfolioRoute, async (c) => {
    const result = await projectsService.portfolio(
      c.req.valid('query'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(listRoute, async (c) => {
    const result = await projectsService.list(
      c.req.valid('query'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(publicProjectStatusRoute, async (c) => {
    const { id } = c.req.valid('param');
    await projectsService.assertPublicProjectNotDeleted(id);
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return c.body(null, 204);
  })
  .openapi(publicProjectByIdRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.getPublicById(id);
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    if ('availability' in result && result.availability === 'unavailable') {
      c.header('X-Robots-Tag', 'noindex');
    }
    return c.json(result, 200);
  })
  .openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user');
    const project = await projectsService.getById(
      id,
      user ? caller(user, c.get('session')) : undefined,
    );
    return c.json(project, 200);
  })
  .openapi(createProjectRoute, async (c) => {
    const project = await projectsService.create(
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(project, 201);
  })
  .openapi(updateProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const project = await projectsService.update(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(project, 200);
  })
  .openapi(archiveProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.archive(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(restoreProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.restore(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(deleteProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.delete(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(duplicateProjectRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.duplicate(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 201);
  })
  .openapi(listRoomsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.listRooms(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(createRoomRoute, async (c) => {
    const { id } = c.req.valid('param');
    const room = await projectsService.createRoom(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(room, 201);
  })
  .openapi(reorderRoomsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.reorderRooms(
      id,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(updateRoomRoute, async (c) => {
    const { id, roomId } = c.req.valid('param');
    const room = await projectsService.updateRoom(
      id,
      roomId,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(room, 200);
  })
  .openapi(deleteRoomRoute, async (c) => {
    const { id, roomId } = c.req.valid('param');
    const result = await projectsService.deleteRoom(
      id,
      roomId,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(linkImageRoute, async (c) => {
    const { id, imageId } = c.req.valid('param');
    const result = await projectsService.linkImage(
      id,
      imageId,
      c.req.valid('json'),
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(deleteImageRoute, async (c) => {
    const { id, imageId } = c.req.valid('param');
    const result = await projectsService.deleteImage(
      id,
      imageId,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(completenessRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.getCompleteness(
      id,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(submitRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.submit(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(withdrawRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.withdraw(id, caller(c.get('user'), c.get('session')));
    return c.json(result, 200);
  })
  .openapi(moderationHistoryRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.moderationHistory(
      id,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  .openapi(reviewCommentsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await projectsService.reviewComments(
      id,
      caller(c.get('user'), c.get('session')),
    );
    return c.json(result, 200);
  })
  // --- Public read endpoints (E-195) ---
  .openapi(
    createRoute({
      method: 'get',
      path: '/slug/{slug}',
      tags: ['Projects'],
      summary: 'Public project detail by slug (published only)',
      request: { params: projectSlugParamSchema },
      responses: {
        200: {
          description:
            'Published project read model with rooms, gallery, designer, and recommendations',
          content: { 'application/json': { schema: publicProjectBySlugResponseSchema } },
        },
        404: errorJson('Project not found or not published'),
        410: errorJson('Project permanently deleted'),
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const result = await projectsService.getPublicPageBySlug(slug);
      c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      if ('availability' in result && result.availability === 'unavailable') {
        c.header('X-Robots-Tag', 'noindex');
      }
      return c.json(result, 200);
    },
  );

export type ProjectsRoutes = typeof projectsRoutes;
