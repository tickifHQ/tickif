import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  publicProfileSchema,
  ownerProfileSchema,
  patchProfileSchema,
  profileIdParamSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { profilesService } from './service.js';

/**
 * Profile HTTP routes.
 *
 * GET /api/profiles/:id  — public projection (no auth required).
 * PATCH /api/profiles/me — owner update (auth required, derives user from session).
 */

const getProfileRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Profiles'],
  summary: 'Get a public profile by id',
  request: { params: profileIdParamSchema },
  responses: {
    200: {
      description: 'Public profile',
      content: { 'application/json': { schema: publicProfileSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const updateProfileRoute = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['Profiles'],
  summary: 'Update own profile',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: patchProfileSchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated profile (owner projection)',
      content: { 'application/json': { schema: ownerProfileSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Profile not found',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(getProfileRoute, async (c) => {
    const { id } = c.req.valid('param');
    const profile = await profilesService.getPublicProfile(id);
    return c.json(profile, 200);
  })
  .openapi(updateProfileRoute, async (c) => {
    const user = c.get('user')!;
    const input = c.req.valid('json');
    const profile = await profilesService.updateProfile(user.id, input);
    return c.json(profile, 200);
  });

export type ProfilesRoutes = typeof profilesRoutes;
