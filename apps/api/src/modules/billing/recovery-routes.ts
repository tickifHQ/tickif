import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  billingRecoveryDismissRequestSchema,
  billingRecoveryRequestSchema,
  billingRecoveryResponseSchema,
} from '@repo/contracts';
import { requireAuth, type AuthVariables } from '../../lib/auth-middleware.js';
import { recoveryService } from './recovery-service.js';

const common = {
  tags: ['Billing'],
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: 'Durable billing recovery',
      content: { 'application/json': { schema: billingRecoveryResponseSchema } },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Billing access required' },
    409: { description: 'Stale revision or unavailable action' },
  },
};
const get = createRoute({
  ...common,
  middleware: [requireAuth] as const,
  method: 'get',
  path: '/recovery',
});
const save = createRoute({
  ...common,
  middleware: [requireAuth] as const,
  method: 'post',
  path: '/recovery',
  request: { body: { content: { 'application/json': { schema: billingRecoveryRequestSchema } } } },
});
const dismiss = createRoute({
  ...common,
  middleware: [requireAuth] as const,
  method: 'post',
  path: '/recovery/dismiss',
  request: {
    body: { content: { 'application/json': { schema: billingRecoveryDismissRequestSchema } } },
  },
});
export const recoveryRoutes = new OpenAPIHono<{ Variables: AuthVariables }>()
  .openapi(get, async (c) =>
    c.json(
      await recoveryService.get({
        userId: c.get('user')!.id,
        activeOrgId: c.get('session')!.activeOrganizationId ?? null,
      }),
      200,
    ),
  )
  .openapi(save, async (c) =>
    c.json(
      await recoveryService.save(
        { userId: c.get('user')!.id, activeOrgId: c.get('session')!.activeOrganizationId ?? null },
        c.req.valid('json'),
      ),
      200,
    ),
  )
  .openapi(dismiss, async (c) =>
    c.json(
      await recoveryService.dismiss(
        { userId: c.get('user')!.id, activeOrgId: c.get('session')!.activeOrganizationId ?? null },
        c.req.valid('json'),
      ),
      200,
    ),
  );
