import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  createOwnershipTransferSchema,
  activeContextResponseSchema,
  setActiveContextSchema,
  onboardDesignerSchema,
  onboardDesignerResponseSchema,
  errorResponseSchema,
  organizationWorkspaceResponseSchema,
  organizationBranchesResponseSchema,
  ownershipTransferIdParamSchema,
  ownershipTransferResponseSchema,
} from '@repo/contracts';
import { setActiveOrganization, setActiveTeam } from '@repo/auth';
import type { AuthVariables } from '../../lib/auth-middleware.js';
import { requireAuth } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { orgsService } from './service.js';
import { profilesService } from '../profiles/service.js';

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

const listBranchesRoute = createRoute({
  method: 'get',
  path: '/branches',
  tags: ['Organizations'],
  summary: 'List active branches and branch-scoped members',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Branches visible to the current organization member',
      content: { 'application/json': { schema: organizationBranchesResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Caller is not a member of the active organization'),
    422: errorJson('No active organization selected'),
  },
});

const getContextRoute = createRoute({
  method: 'get',
  path: '/context',
  tags: ['Organizations'],
  summary: 'Get the active personal or organization context',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Current validated context',
      content: { 'application/json': { schema: activeContextResponseSchema } },
    },
    401: errorJson('Unauthorized'),
  },
});

const setContextRoute = createRoute({
  method: 'put',
  path: '/context',
  tags: ['Organizations'],
  summary: 'Select and persist a personal or organization context',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: setActiveContextSchema } } },
  },
  responses: {
    200: {
      description: 'Selected context',
      content: { 'application/json': { schema: activeContextResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Organization or branch membership is unavailable'),
  },
});

const createOrganizationRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Organizations'],
  summary: 'Create another organization with its default branch and public profile',
  security: [{ cookieAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: onboardDesignerSchema } } },
  },
  responses: {
    201: {
      description: 'Organization created and selected',
      content: { 'application/json': { schema: onboardDesignerResponseSchema } },
    },
    401: errorJson('Unauthorized'),
    422: errorJson('Invalid organization profile'),
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
  .openapi(getContextRoute, async (c) => c.json({ context: c.get('activeContext') }, 200))
  .openapi(setContextRoute, async (c) => {
    const user = c.get('user')!;
    const context = await orgsService.resolveContextSelection(user.id, c.req.valid('json'));

    const organizationResponse = await setActiveOrganization(
      c.req.raw.headers,
      context.kind === 'organization' ? context.organizationId : null,
    );
    if (!organizationResponse.ok) throw new Error('Failed to select organization context');
    for (const cookie of organizationResponse.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    if (context.kind === 'organization') {
      const teamResponse = await setActiveTeam(c.req.raw.headers, context.teamId);
      if (!teamResponse.ok) throw new Error('Failed to select branch context');
      for (const cookie of teamResponse.headers.getSetCookie()) {
        c.header('Set-Cookie', cookie, { append: true });
      }
    }
    await orgsService.saveContextPreference(user.id, context);
    return c.json({ context }, 200);
  })
  .openapi(createOrganizationRoute, async (c) => {
    const user = c.get('user')!;
    const { data, activeTeamId } = await profilesService.onboardDesigner(
      user.id,
      c.req.valid('json'),
      { allowAdditionalOrganization: true },
    );
    const context = {
      kind: 'organization' as const,
      organizationId: data.organization.id,
      teamId: activeTeamId,
    };
    const organizationResponse = await setActiveOrganization(
      c.req.raw.headers,
      context.organizationId,
    );
    if (!organizationResponse.ok) throw new Error('Failed to activate the new organization');
    for (const cookie of organizationResponse.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    const teamResponse = await setActiveTeam(c.req.raw.headers, context.teamId);
    if (!teamResponse.ok) throw new Error('Failed to activate the new branch');
    for (const cookie of teamResponse.headers.getSetCookie()) {
      c.header('Set-Cookie', cookie, { append: true });
    }
    await orgsService.saveContextPreference(user.id, context);
    return c.json(data, 201);
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
  .openapi(listBranchesRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    if (!user) throw AppError.unauthorized();
    if (!session?.activeOrganizationId) {
      throw AppError.unprocessable('Select an active organization');
    }
    const result = await orgsService.listBranches({
      userId: user.id,
      organizationId: session.activeOrganizationId,
      activeTeamId: session.activeTeamId ?? null,
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
