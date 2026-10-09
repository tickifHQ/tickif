import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { earlyBirdClaimSchema, earlyBirdStatusSchema } from '@repo/contracts';
import { requireAuth, type AuthVariables } from '../../lib/auth-middleware.js';
import { earlyBirdService } from './early-bird-service.js';

const responses = {
  200: {
    description: 'Offer eligibility and active trial',
    content: { 'application/json': { schema: earlyBirdStatusSchema } },
  },
  401: { description: 'Authentication required' },
  403: { description: 'Organization billing access required' },
  409: { description: 'Offer unavailable or previously claimed' },
  422: { description: 'Select an organization and a paid tier' },
};
const status = createRoute({
  method: 'get',
  path: '/early-bird',
  tags: ['Billing'],
  middleware: [requireAuth] as const,
  security: [{ cookieAuth: [] }],
  responses,
});
const claim = createRoute({
  method: 'post',
  path: '/early-bird',
  tags: ['Billing'],
  middleware: [requireAuth] as const,
  security: [{ cookieAuth: [] }],
  request: { body: { content: { 'application/json': { schema: earlyBirdClaimSchema } } } },
  responses,
});

export const earlyBirdRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(status, async (c) =>
    c.json(
      await earlyBirdService.status({
        userId: c.get('user')!.id,
        activeOrgId: c.get('session')!.activeOrganizationId ?? null,
      }),
      200,
    ),
  )
  .openapi(claim, async (c) =>
    c.json(
      await earlyBirdService.claim(
        { userId: c.get('user')!.id, activeOrgId: c.get('session')!.activeOrganizationId ?? null },
        c.req.valid('json').targetTier,
      ),
      200,
    ),
  );
