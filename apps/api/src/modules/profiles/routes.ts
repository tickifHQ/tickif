import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  profileCompletionResponseSchema,
  profileDashboardResponseSchema,
  onboardDesignerSchema,
  onboardDesignerResponseSchema,
  profilePublicResponseSchema,
  profileOwnerResponseSchema,
  currentProfileResponseSchema,
  profileIdParamSchema,
  profileSlugParamSchema,
  updateProfileSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { dashboardService } from '../dashboard/service.js';
import { profilesService } from './service.js';

/**
 * Profiles HTTP routes. Authenticated endpoints for the current user's profile.
 */

const completionRoute = createRoute({
  method: 'get',
  path: '/me/completion',
  tags: ['Profiles'],
  summary: 'Get profile completion checklist and score',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Completion checklist with steps, score, and missing items',
      content: { 'application/json': { schema: profileCompletionResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const dashboardRoute = createRoute({
  method: 'get',
  path: '/me/dashboard',
  tags: ['Profiles'],
  summary: 'Get dashboard summary for the active designer organization',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Dashboard summary with completion, project counts, lead counts, and share URL',
      content: { 'application/json': { schema: profileDashboardResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: 'No designer profile for the active organization',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

const onboardRoute = createRoute({
  method: 'post',
  path: '/me',
  tags: ['Profiles'],
  summary: 'Designer onboarding — create profile + org in one transaction',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: onboardDesignerSchema } },
    },
  },
  responses: {
    200: {
      description: 'Already onboarded — idempotent return',
      content: { 'application/json': { schema: onboardDesignerResponseSchema } },
    },
    201: {
      description: 'Successfully onboarded',
      content: { 'application/json': { schema: onboardDesignerResponseSchema } },
    },
    401: {
      description: 'Unauthorized or banned',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Validation error — invalid taxonomy IDs or missing required fields',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags: ['Profiles'],
      summary: 'Get own profile and active organization context',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      responses: {
        200: {
          description: 'Current owner profile context',
          content: { 'application/json': { schema: currentProfileResponseSchema } },
        },
        401: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        403: {
          description: 'Forbidden — not a writer in the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        404: {
          description: 'No profile for the active organization',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
        422: {
          description: 'No active organization selected',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const result = await profilesService.getCurrentProfile(
        user.id,
        session?.activeOrganizationId ?? null,
      );
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/slug/{slug}',
      tags: ['Profiles'],
      summary: 'Get a public profile by organization slug (active only)',
      request: { params: profileSlugParamSchema },
      responses: {
        200: {
          description: 'Public profile projection',
          content: { 'application/json': { schema: profilePublicResponseSchema } },
        },
        404: {
          description: 'Profile not found or not active',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { slug } = c.req.valid('param');
      const result = await profilesService.getPublicProfileBySlug(slug);
      return c.json(result, 200);
    },
  )
  .openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags: ['Profiles'],
      summary: 'Get a public profile by ID (active only)',
      request: { params: profileIdParamSchema },
      responses: {
        200: {
          description: 'Public profile projection',
          content: { 'application/json': { schema: profilePublicResponseSchema } },
        },
        404: {
          description: 'Profile not found or not active',
          content: { 'application/json': { schema: errorResponseSchema } },
        },
      },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const result = await profilesService.getPublicProfile(id);
      return c.json(result, 200);
    },
  )
  .openapi(completionRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await profilesService.getCompletion({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(dashboardRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await dashboardService.getProfileDashboard({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(onboardRoute, async (c) => {
    const user = c.get('user')!;
    const input = c.req.valid('json');
    const { data, created } = await profilesService.onboardDesigner(user.id, input);
    return c.json(data, created ? 201 : 200);
  })
  .openapi(
    createRoute({
      method: 'patch',
      path: '/me',
      tags: ['Profiles'],
      summary: 'Update own profile (org writer role required)',
      security: [{ cookieAuth: [] }],
      middleware: [requireAuth] as const,
      request: {
        body: {
          content: { 'application/json': { schema: updateProfileSchema } },
        },
      },
      responses: {
        200: {
          description: 'Updated profile (owner projection)',
          content: { 'application/json': { schema: profileOwnerResponseSchema } },
        },
        401: { description: 'Unauthorized', content: { 'application/json': { schema: errorResponseSchema } } },
        403: { description: 'Forbidden — not a writer in the active organization', content: { 'application/json': { schema: errorResponseSchema } } },
        404: { description: 'No profile for the active organization', content: { 'application/json': { schema: errorResponseSchema } } },
        422: { description: 'No active organization or invalid taxonomy IDs', content: { 'application/json': { schema: errorResponseSchema } } },
      },
    }),
    async (c) => {
      const user = c.get('user')!;
      const session = c.get('session');
      const input = c.req.valid('json');
      const result = await profilesService.updateProfile(
        user.id,
        session?.activeOrganizationId ?? null,
        input,
      );
      return c.json(result, 200);
    },
  );

export type ProfilesRoutes = typeof profilesRoutes;
