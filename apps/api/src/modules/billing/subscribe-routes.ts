import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { planTierSchema } from '@repo/contracts';
import { requireAuth } from '../../lib/auth-middleware.js';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { subscribeService } from './subscribe-service.js';

// ─── Route Definitions ───────────────────────────────────────────────────────

const subscribeRoute = createRoute({
  method: 'post',
  path: '/subscribe',
  tags: ['Billing'],
  summary: 'Create a new Razorpay subscription for the active organization',
  description: 'Resolves the Razorpay plan ID server-side from the target tier. Only org owners can subscribe.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            targetTier: planTierSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Subscription created',
      content: {
        'application/json': {
          schema: z.object({
            razorpaySubscriptionId: z.string(),
            shortUrl: z.string().nullable(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller is not the organization owner' },
    409: { description: 'Organization already has an active subscription' },
    422: { description: 'Invalid tier or billing not configured' },
  },
});

const changePlanRoute = createRoute({
  method: 'post',
  path: '/change-plan',
  tags: ['Billing'],
  summary: 'Change the plan for an existing Razorpay subscription',
  description: 'Resolves the target Razorpay plan ID server-side. Only org owners can change plans.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            targetTier: planTierSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Plan changed',
      content: {
        'application/json': {
          schema: z.object({
            razorpaySubscriptionId: z.string(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller is not the organization owner' },
    404: { description: 'No active subscription found' },
    422: { description: 'Invalid tier, same plan, or billing not configured' },
  },
});

const cancelRoute = createRoute({
  method: 'post',
  path: '/cancel',
  tags: ['Billing'],
  summary: 'Cancel the current paid subscription (downgrade to Hobby at cycle end)',
  description:
    'Cancels the Razorpay subscription at the end of the current billing cycle. ' +
    'The org stays on the current plan until the period ends. ' +
    'E-117 webhook processes the actual state change.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Cancellation scheduled',
      content: {
        'application/json': {
          schema: z.object({
            razorpaySubscriptionId: z.string(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller is not the organization owner' },
    404: { description: 'No active subscription found' },
    422: { description: 'Already on Hobby' },
  },
});

// ─── Route Handlers ──────────────────────────────────────────────────────────

export const subscribeRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(subscribeRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const { targetTier } = c.req.valid('json');

    const result = await subscribeService.createSubscription(
      { userId: user!.id, activeOrgId: session!.activeOrganizationId ?? null },
      { targetTier },
    );

    return c.json(result, 200);
  })
  .openapi(changePlanRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const { targetTier } = c.req.valid('json');

    const result = await subscribeService.changePlan(
      { userId: user!.id, activeOrgId: session!.activeOrganizationId ?? null },
      { targetTier },
    );

    return c.json(result, 200);
  })
  .openapi(cancelRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');

    const result = await subscribeService.cancelSubscription({
      userId: user!.id,
      activeOrgId: session!.activeOrganizationId ?? null,
    });

    return c.json(result, 200);
  });
