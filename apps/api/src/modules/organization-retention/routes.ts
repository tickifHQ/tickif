import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  organizationRetentionMutationResponseSchema,
  organizationRetentionOrganizationParamSchema,
  organizationRetentionResponseSchema,
  permanentlyEraseOrganizationResponseSchema,
  permanentlyEraseOrganizationSchema,
  placeOrganizationRetentionHoldSchema,
  requestOrganizationDeletionSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth, requireRole } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { organizationRetentionService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

const retentionMutationResponses = {
  200: {
    description: 'Updated organization retention lifecycle',
    content: { 'application/json': { schema: organizationRetentionMutationResponseSchema } },
  },
  401: errorJson('Unauthorized'),
  403: errorJson('Owner permission required'),
  404: errorJson('Organization not found'),
  409: errorJson('Retention lifecycle is not actionable'),
  422: errorJson('Invalid confirmation'),
} as const;

const getRetentionRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Organization Retention'],
  summary: 'Get the active organization retention lifecycle',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Current organization retention lifecycle, if any',
      content: { 'application/json': { schema: organizationRetentionResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Owner permission required'),
    404: errorJson('Organization not found'),
    422: errorJson('No active organization selected'),
  },
});

const requestDeletionRoute = createRoute({
  method: 'post',
  path: '/deletion',
  tags: ['Organization Retention'],
  summary: 'Request recoverable organization deletion',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: requestOrganizationDeletionSchema } },
    },
  },
  responses: retentionMutationResponses,
});

const restoreRoute = createRoute({
  method: 'post',
  path: '/restore',
  tags: ['Organization Retention'],
  summary: 'Restore an organization during its owner recovery window',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: retentionMutationResponses,
});

const permanentErasureRoute = createRoute({
  method: 'post',
  path: '/permanent-erasure',
  tags: ['Organization Retention'],
  summary: 'Explicitly request irreversible organization erasure',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: permanentlyEraseOrganizationSchema } },
    },
  },
  responses: {
    202: {
      description: 'Permanent erasure accepted for asynchronous processing',
      content: { 'application/json': { schema: permanentlyEraseOrganizationResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Owner permission required'),
    404: errorJson('Organization not found'),
    409: errorJson('Organization is under a legal hold or already being erased'),
    422: errorJson('Invalid confirmation'),
  },
});

function activeCaller(c: {
  get(name: 'user'): AuthVariables['user'];
  get(name: 'session'): AuthVariables['session'];
}) {
  const user = c.get('user');
  const organizationId = c.get('session')?.activeOrganizationId;
  if (!user) throw AppError.unauthorized();
  if (!organizationId) throw AppError.unprocessable('Select an active organization');
  return { userId: user.id, organizationId };
}

export const organizationRetentionRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(getRetentionRoute, async (c) =>
    c.json(await organizationRetentionService.getForOwner(activeCaller(c)), 200),
  )
  .openapi(requestDeletionRoute, async (c) => {
    const caller = activeCaller(c);
    return c.json(
      await organizationRetentionService.requestDeletion({
        ...caller,
        confirmationSlug: c.req.valid('json').confirmationSlug,
      }),
      200,
    );
  })
  .openapi(restoreRoute, async (c) =>
    c.json(await organizationRetentionService.restoreForOwner(activeCaller(c)), 200),
  )
  .openapi(permanentErasureRoute, async (c) => {
    const caller = activeCaller(c);
    return c.json(
      await organizationRetentionService.requestPermanentErasure({
        ...caller,
        confirmationSlug: c.req.valid('json').confirmationSlug,
      }),
      202,
    );
  });

const adminMiddleware = [requireAuth, requireRole('superadmin')];

const adminRestoreRoute = createRoute({
  method: 'post',
  path: '/{organizationId}/retention/restore',
  tags: ['Admin Organization Retention'],
  summary: 'Recover an archived organization',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: organizationRetentionOrganizationParamSchema },
  responses: retentionMutationResponses,
});

const adminGetRoute = createRoute({
  method: 'get',
  path: '/{organizationId}/retention',
  tags: ['Admin Organization Retention'],
  summary: 'Get an organization retention lifecycle',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: organizationRetentionOrganizationParamSchema },
  responses: {
    200: {
      description: 'Organization retention lifecycle, if any',
      content: { 'application/json': { schema: organizationRetentionResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Superadmin role required'),
    404: errorJson('Organization not found'),
  },
});

const placeHoldRoute = createRoute({
  method: 'post',
  path: '/{organizationId}/retention/hold',
  tags: ['Admin Organization Retention'],
  summary: 'Place a legal hold on retained organization data',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: {
    params: organizationRetentionOrganizationParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: placeOrganizationRetentionHoldSchema } },
    },
  },
  responses: retentionMutationResponses,
});

const releaseHoldRoute = createRoute({
  method: 'delete',
  path: '/{organizationId}/retention/hold',
  tags: ['Admin Organization Retention'],
  summary: 'Release a legal hold on retained organization data',
  security: [{ cookieAuth: [] }],
  middleware: adminMiddleware,
  request: { params: organizationRetentionOrganizationParamSchema },
  responses: retentionMutationResponses,
});

function superadminId(user: AuthVariables['user']): string {
  if (!user) throw AppError.unauthorized();
  return user.id;
}

export const adminOrganizationRetentionRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(adminGetRoute, async (c) =>
    c.json(
      await organizationRetentionService.getForSuperadmin(c.req.valid('param').organizationId),
      200,
    ),
  )
  .openapi(adminRestoreRoute, async (c) =>
    c.json(
      await organizationRetentionService.restoreArchived({
        organizationId: c.req.valid('param').organizationId,
        actorUserId: superadminId(c.get('user')),
      }),
      200,
    ),
  )
  .openapi(placeHoldRoute, async (c) =>
    c.json(
      await organizationRetentionService.placeHold({
        organizationId: c.req.valid('param').organizationId,
        actorUserId: superadminId(c.get('user')),
        reason: c.req.valid('json').reason,
      }),
      200,
    ),
  )
  .openapi(releaseHoldRoute, async (c) =>
    c.json(
      await organizationRetentionService.releaseHold({
        organizationId: c.req.valid('param').organizationId,
        actorUserId: superadminId(c.get('user')),
      }),
      200,
    ),
  );
