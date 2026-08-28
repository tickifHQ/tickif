import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { config } from '@repo/config';
import { razorpayEventSchema } from '@repo/contracts';
import { verifyWebhookSignature, processWebhookEvent } from './webhook-service.js';
import type { AuthVariables } from '../../lib/auth-middleware.js';

/**
 * E-117 Razorpay Webhook Route.
 *
 * This route is UNAUTHENTICATED at the application-user level.
 * Authentication is via Razorpay's HMAC-SHA256 signature verification.
 *
 * Always returns 200 to Razorpay (even for business-logic rejections) to prevent
 * unnecessary retries. Only returns non-200 for signature/configuration failures.
 */

const webhookRoute = createRoute({
  method: 'post',
  path: '/webhook',
  tags: ['Billing'],
  summary: 'Razorpay webhook receiver',
  description:
    'Receives and processes Razorpay subscription webhook events. ' +
    'Verifies HMAC-SHA256 signature before any processing. ' +
    'No application auth — Razorpay authenticates via webhook secret.',
  request: {
    body: {
      content: { 'application/json': { schema: z.object({}).passthrough() } },
    },
  },
  responses: {
    200: {
      description: 'Event processed, duplicated, or safely ignored',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string(),
            reason: z.string().optional(),
          }),
        },
      },
    },
    401: { description: 'Invalid or missing webhook signature' },
    503: { description: 'Webhook processing not configured' },
  },
});

export const webhookRoutes = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  webhookRoute,
  async (c) => {
    const webhookSecret = config.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return c.json({ error: 'Webhook processing not configured' }, 503);
    }

    // Read raw body for signature verification BEFORE parsing.
    const rawBody = await c.req.raw.clone().text();
    const signature = c.req.header('x-razorpay-signature');

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      return c.json({ error: 'Invalid webhook signature' }, 401);
    }

    // Parse the verified payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return c.json({ status: 'ignored', reason: 'Malformed JSON' }, 200);
    }

    // Extract and validate event type
    const eventType = typeof payload.event === 'string' ? payload.event : null;
    const parsed = razorpayEventSchema.safeParse(eventType);

    if (!parsed.success) {
      // Unknown/unsupported event — acknowledge to prevent retries
      return c.json({ status: 'ignored', reason: 'Unsupported event type' }, 200);
    }

    const result = await processWebhookEvent(parsed.data, payload);
    return c.json({ status: result.outcome, ...('reason' in result ? { reason: result.reason } : {}) }, 200);
  },
);
