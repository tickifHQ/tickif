import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  profileCompletionResponseSchema,
  onboardDesignerSchema,
  onboardDesignerResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
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
    403: {
      description: 'Forbidden — no Google account linked',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Validation error — invalid taxonomy IDs or missing required fields',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(completionRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await profilesService.getCompletion({
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
  });

export type ProfilesRoutes = typeof profilesRoutes;
