import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import {
  billingPlanRequestSchema,
  billingCheckoutResponseSchema,
  billingPlanResponseSchema,
  billingCancelResponseSchema,
  billingVerifyRequestSchema,
  billingVerifyResponseSchema,
  billingRefreshResponseSchema,
  billingPaymentsQuerySchema,
  billingPaymentsResponseSchema,
} from '@repo/contracts';
import { config } from '@repo/config';
import { requireAuth } from '../../lib/auth-middleware.js';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { subscribeService } from './subscribe-service.js';

// ─── Route Definitions ───────────────────────────────────────────────────────

const subscribeRoute = createRoute({
  method: 'post',
  path: '/subscribe',
  tags: ['Billing'],
  summary: 'Create a new Razorpay subscription for the active organization',
  description:
    'Resolves the Razorpay plan ID server-side from the target tier. Requires organization billing access.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: billingPlanRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Subscription created',
      content: {
        'application/json': {
          schema: billingCheckoutResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller lacks organization billing access' },
    409: { description: 'Organization already has an active subscription' },
    422: { description: 'Invalid tier or billing not configured' },
    502: { description: 'Billing provider unavailable or returned an invalid response' },
  },
});

const changePlanRoute = createRoute({
  method: 'post',
  path: '/change-plan',
  tags: ['Billing'],
  summary: 'Change the plan for an existing Razorpay subscription',
  description:
    'Resolves the target Razorpay plan ID server-side. Requires organization billing access.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: billingPlanRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Plan changed',
      content: {
        'application/json': {
          schema: billingPlanResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller lacks organization billing access' },
    404: { description: 'No active subscription found' },
    422: { description: 'Invalid tier, same plan, or billing not configured' },
    502: { description: 'Billing provider unavailable or returned an invalid response' },
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
      description: 'Cancellation scheduled or already scheduled',
      content: {
        'application/json': {
          schema: billingCancelResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Caller lacks organization billing access' },
    404: { description: 'No active subscription found' },
    422: { description: 'Already on Hobby' },
    502: { description: 'Billing provider unavailable or returned an invalid response' },
  },
});

const verifyPaymentRoute = createRoute({
  method: 'post',
  path: '/verify-payment',
  tags: ['Billing'],
  summary: 'Verify a Razorpay Checkout JS payment callback',
  description:
    'Verifies the razorpay_signature from the Checkout JS handler callback. ' +
    'Does NOT activate the subscription — E-117 webhook is authoritative. ' +
    'Updates razorpayStatus to acknowledge payment authentication.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: {
        'application/json': {
          schema: billingVerifyRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Payment verified',
      content: {
        'application/json': {
          schema: billingVerifyResponseSchema,
        },
      },
    },
    400: { description: 'Invalid signature' },
    401: { description: 'Unauthorized' },
    403: { description: 'Billing access required or payment belongs to another organization' },
  },
});

const refreshRoute = createRoute({
  method: 'get',
  path: '/subscription/refresh',
  tags: ['Billing'],
  summary: 'Refresh subscription state from Razorpay (reconciliation)',
  description:
    'Queries Razorpay live API for the current subscription state and reconciles local DB if needed. ' +
    'Self-healing when webhooks were missed or delayed. Throttled server-side.',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Reconciliation result',
      content: {
        'application/json': {
          schema: billingRefreshResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Billing access required' },
  },
});

const paymentMethodRoute = createRoute({
  method: 'post',
  path: '/payment-method',
  tags: ['Billing'],
  summary: 'Open Razorpay Checkout to update an existing subscription payment method',
  middleware: [requireAuth] as const,
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: 'Existing subscription checkout',
      content: { 'application/json': { schema: billingCheckoutResponseSchema } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Billing access required' },
    404: { description: 'No subscription' },
    409: { description: 'Subscription is not recoverable' },
    502: { description: 'Billing provider unavailable or returned an invalid response' },
  },
});
const paymentsRoute = createRoute({
  method: 'get',
  path: '/payments',
  tags: ['Billing'],
  summary: 'List recorded payments for the active organization',
  middleware: [requireAuth] as const,
  security: [{ cookieAuth: [] }],
  request: { query: billingPaymentsQuerySchema },
  responses: {
    200: {
      description: 'Payment history',
      content: { 'application/json': { schema: billingPaymentsResponseSchema } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Billing access required' },
  },
});

// ─── Route Handlers ──────────────────────────────────────────────────────────

export const subscribeRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(paymentMethodRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;
    const result = await subscribeService.paymentMethod({
      userId: user.id,
      activeOrgId: session.activeOrganizationId ?? null,
    });
    return c.json(
      {
        ...result,
        razorpayKeyId: config.RAZORPAY_KEY_ID ?? '',
        prefill: {
          name: user.name?.startsWith('+') ? null : (user.name ?? null),
          email: user.email?.endsWith('@phone.tickif.local') ? null : (user.email ?? null),
          contact: (user as { phoneNumber?: string }).phoneNumber ?? null,
        },
      },
      200,
    );
  })
  .openapi(paymentsRoute, async (c) => {
    const user = c.get('user')!;
    const session = c.get('session')!;
    return c.json(
      await subscribeService.payments(
        { userId: user.id, activeOrgId: session.activeOrganizationId ?? null },
        c.req.valid('query'),
      ),
      200,
    );
  })
  .openapi(subscribeRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const { targetTier } = c.req.valid('json');

    const result = await subscribeService.createSubscription(
      { userId: user!.id, activeOrgId: session!.activeOrganizationId ?? null },
      { targetTier },
    );

    // Filter out placeholder values from phone-OTP signup:
    // - email: "+91xxx@phone.tickif.local" is not a real email
    // - name: better-auth sets the phone number as temp name
    const rawEmail = user!.email ?? null;
    const rawName = user!.name ?? null;
    const email = rawEmail?.endsWith('@phone.tickif.local') ? null : rawEmail;
    const name = rawName?.startsWith('+') ? null : rawName;

    return c.json(
      {
        ...result,
        razorpayKeyId: config.RAZORPAY_KEY_ID ?? '',
        prefill: {
          name,
          email,
          contact: (user as { phoneNumber?: string }).phoneNumber ?? null,
        },
      },
      200,
    );
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
  })
  .openapi(verifyPaymentRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    const body = c.req.valid('json');

    const result = await subscribeService.verifyPayment(
      { userId: user!.id, activeOrgId: session!.activeOrganizationId ?? null },
      body,
    );

    return c.json(result, 200);
  })
  .openapi(refreshRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');

    const result = await subscribeService.refreshSubscription({
      userId: user!.id,
      activeOrgId: session!.activeOrganizationId ?? null,
    });

    return c.json(result, 200);
  });
