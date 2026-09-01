import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createOwnershipTransferSchema,
  errorResponseSchema,
  organizationWorkspaceResponseSchema,
  ownershipTransferIdParamSchema,
  ownershipTransferResponseSchema,
} from '@repo/contracts';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { orgsService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});

const currentWorkspaceRoute = createRoute({
  method: 'get',
  path: '/current',
  tags: ['Organizations'],
  summary: 'Get the active organization workspace',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Active organization members, roles, and pending invitations',
      content: { 'application/json': { schema: organizationWorkspaceResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller is not a member of the active organization'),
    422: errorJson('No active organization selected'),
  },
});

const createTransferRoute = createRoute({
  method: 'post',
  path: '/ownership-transfers',
  tags: ['Organizations'],
  summary: 'Nominate an Admin or Member for organization ownership',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: createOwnershipTransferSchema } },
    },
  },
  responses: {
    201: {
      description: 'Pending ownership transfer',
      content: { 'application/json': { schema: ownershipTransferResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    402: errorJson('Corporate plan required'),
    403: errorJson('Only the organization Owner can initiate a transfer'),
    409: errorJson('A transfer is already pending'),
    422: errorJson('Target must be an active Admin or Member'),
  },
});

function transferActionRoute(action: 'accept' | 'decline' | 'cancel') {
  return createRoute({
    method: 'post',
    path: `/ownership-transfers/{id}/${action}`,
    tags: ['Organizations'],
    summary: `${action[0]!.toUpperCase()}${action.slice(1)} an ownership transfer`,
    security: [{ cookieAuth: [] }],
    middleware: [requireAuth] as const,
    request: { params: ownershipTransferIdParamSchema },
    responses: {
      200: {
        description: 'Resolved ownership transfer',
        content: { 'application/json': { schema: ownershipTransferResponseSchema } },
      },
      401: errorJson('Unauthorized'),
      402: errorJson('Corporate plan required'),
      403: errorJson('Only the intended party can perform this action'),
      404: errorJson('Ownership transfer not found'),
      409: errorJson('Ownership transfer is no longer actionable'),
    },
  });
}

const acceptTransferRoute = transferActionRoute('accept');
const declineTransferRoute = transferActionRoute('decline');
const cancelTransferRoute = transferActionRoute('cancel');

export const orgsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(currentWorkspaceRoute, async (c) => {
    const user = c.get('user');
    if (!user) throw AppError.unauthorized();
    const result = await orgsService.getCurrentWorkspace({
      userId: user.id,
      activeOrgId: c.get('session')?.activeOrganizationId ?? null,
    });
    return c.json(result, 200);
  })
  .openapi(createTransferRoute, async (c) => {
    const user = c.get('user');
    const organizationId = c.get('session')?.activeOrganizationId;
    if (!user) throw AppError.unauthorized();
    if (!organizationId) throw AppError.unprocessable('Select an active organization');
    const result = await orgsService.createOwnershipTransfer({
      userId: user.id,
      organizationId,
      targetMemberId: c.req.valid('json').targetMemberId,
    });
    return c.json(result, 201);
  })
  .openapi(acceptTransferRoute, async (c) => {
    const user = c.get('user');
    if (!user) throw AppError.unauthorized();
    const result = await orgsService.resolveOwnershipTransfer({
      id: c.req.valid('param').id,
      userId: user.id,
      action: 'accept',
    });
    return c.json(result, 200);
  })
  .openapi(declineTransferRoute, async (c) => {
    const user = c.get('user');
    if (!user) throw AppError.unauthorized();
    const result = await orgsService.resolveOwnershipTransfer({
      id: c.req.valid('param').id,
      userId: user.id,
      action: 'decline',
    });
    return c.json(result, 200);
  })
  .openapi(cancelTransferRoute, async (c) => {
    const user = c.get('user');
    if (!user) throw AppError.unauthorized();
    const result = await orgsService.resolveOwnershipTransfer({
      id: c.req.valid('param').id,
      userId: user.id,
      action: 'cancel',
    });
    return c.json(result, 200);
  });

export type OrgsRoutes = typeof orgsRoutes;
