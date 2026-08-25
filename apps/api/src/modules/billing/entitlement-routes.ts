import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { subscriptionResponseSchema } from '@repo/contracts';
import { requireAuth } from '../../lib/auth-middleware.js';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { orgsService } from '../orgs/service.js';
import { entitlementService } from './entitlement-service.js';

/**
 * E-119 Entitlement read route.
 *
 * GET /subscription — returns the current organization's subscription state
 * and computed entitlements based on (tier, lifecycleState).
 *
 * Uses requireAuth middleware which bypasses the 5-min better-auth cookie cache
 * (calls getSessionWithHeaders with disableCookieCache: true).
 *
 * Authorization decisions MUST read from this service / Redis path,
 * never from the session cookie cache.
 */

const subscriptionRoute = createRoute({
  method: 'get',
  path: '/subscription',
  tags: ['Billing'],
  summary: 'Get current subscription state and entitlements',
  description:
    'Returns the active organization\'s plan tier, lifecycle state, and computed entitlements. ' +
    'Returns Hobby defaults when no subscription exists.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Subscription state and entitlements',
      content: { 'application/json': { schema: subscriptionResponseSchema } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Not a member of the active organization' },
  },
});

export const entitlementRoutes = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  subscriptionRoute,
  async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const activeOrgId = session!.activeOrganizationId ?? null;

    // Verify caller is a member of the organization before exposing billing data.
    // Prevents cross-tenant data access via stale/poisoned activeOrganizationId.
    if (activeOrgId) {
      const isMember = await orgsService.isMember(user!.id, activeOrgId);
      if (!isMember) {
        throw AppError.forbidden('Not a member of the active organization');
      }
    }

    const result = await entitlementService.getSubscription({
      userId: user!.id,
      activeOrgId,
    });

    return c.json(result, 200);
  },
);
