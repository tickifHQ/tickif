import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { profileCompletionResponseSchema, errorResponseSchema } from '@repo/contracts';
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

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  completionRoute,
  async (c) => {
    const user = c.get('user')!;
    const session = c.get('session');
    const result = await profilesService.getCompletion({
      userId: user.id,
      orgId: session?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  },
);

export type ProfilesRoutes = typeof profilesRoutes;
