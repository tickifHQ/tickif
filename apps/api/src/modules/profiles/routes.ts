import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  onboardProfileSchema,
  onboardProfileResponseSchema,
  errorResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { profilesService } from './service.js';

/**
 * Profiles HTTP routes.
 *
 * POST /api/profiles/me — designer onboarding (one-time profile creation).
 */

const onboardRoute = createRoute({
  method: 'post',
  path: '/me',
  tags: ['Profiles'],
  summary: 'Onboard as a designer (create profile)',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { 'application/json': { schema: onboardProfileSchema } },
    },
  },
  responses: {
    201: {
      description: 'Profile created',
      content: { 'application/json': { schema: onboardProfileResponseSchema } },
    },
    200: {
      description: 'Profile already exists (idempotent)',
      content: { 'application/json': { schema: onboardProfileResponseSchema } },
    },
    400: {
      description: 'Invalid taxonomy ref',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    422: {
      description: 'Validation error',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
});

export const profilesRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(onboardRoute, async (c) => {
    const user = c.get('user')!;
    const input = c.req.valid('json');

    // Check idempotency — if profile already exists, return 200 (not 201).
    const { profilesRepository } = await import('./repository.js');
    const existing = await profilesRepository.findByUserId(user.id);

    if (existing) {
      const result = await profilesService.onboard(user.id, input);
      return c.json(result, 200);
    }

    const result = await profilesService.onboard(user.id, input);
    return c.json(result, 201);
  });

export type ProfilesRoutes = typeof profilesRoutes;
