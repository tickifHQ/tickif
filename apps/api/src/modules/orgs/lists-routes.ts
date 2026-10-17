import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  organizationBranchSchema,
  organizationBranchesPageResponseSchema,
  organizationBranchMembersPageResponseSchema,
  organizationMembersPageResponseSchema,
  organizationInvitationsPageResponseSchema,
  organizationWorkspaceResponseSchema,
  organizationListQuerySchema,
  organizationMembersQuerySchema,
  organizationBranchesQuerySchema,
  removeOrganizationBranchParamsSchema,
} from '@repo/contracts';
import { requireOrganizationContext, type AuthVariables } from '../../lib/auth-middleware.js';
import { validationHook } from '../../lib/validation.js';
import { organizationListsService as service } from './lists-service.js';

const shared = {
  tags: ['Organizations'],
  security: [{ cookieAuth: [] }],
  middleware: [requireOrganizationContext] as [typeof requireOrganizationContext],
};
const errors = {
  401: {
    description: 'Authentication required',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  403: {
    description: 'Access denied',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  404: {
    description: 'Branch unavailable',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
  422: {
    description: 'Invalid context or query',
    content: { 'application/json': { schema: errorResponseSchema } },
  },
};
const branches = createRoute({
  ...shared,
  method: 'get',
  path: '/branches/list',
  summary: 'Search and paginate visible branch summaries',
  request: { query: organizationBranchesQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Branch page; members loaded separately',
      content: { 'application/json': { schema: organizationBranchesPageResponseSchema } },
    },
  },
});
const branch = createRoute({
  ...shared,
  method: 'get',
  path: '/branches/{branchId}',
  summary: 'Get an authorized branch summary',
  request: { params: removeOrganizationBranchParamsSchema },
  responses: {
    ...errors,
    200: {
      description: 'Branch summary',
      content: { 'application/json': { schema: organizationBranchSchema } },
    },
  },
});
const branchMembers = createRoute({
  ...shared,
  method: 'get',
  path: '/branches/{branchId}/members',
  summary: 'Search and paginate branch members',
  request: { params: removeOrganizationBranchParamsSchema, query: organizationListQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Branch member page',
      content: { 'application/json': { schema: organizationBranchMembersPageResponseSchema } },
    },
  },
});
const members = createRoute({
  ...shared,
  method: 'get',
  path: '/members',
  summary: 'Search and paginate organization members',
  request: { query: organizationMembersQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Organization member page',
      content: { 'application/json': { schema: organizationMembersPageResponseSchema } },
    },
  },
});
const invitations = createRoute({
  ...shared,
  method: 'get',
  path: '/invitations',
  summary: 'Search and paginate organization invitations',
  request: { query: organizationListQuerySchema },
  responses: {
    ...errors,
    200: {
      description: 'Organization invitation page',
      content: { 'application/json': { schema: organizationInvitationsPageResponseSchema } },
    },
  },
});
const summary = createRoute({
  ...shared,
  method: 'get',
  path: '/summary',
  summary: 'Workspace capabilities and counts without member or invitation arrays',
  responses: {
    ...errors,
    200: {
      description: 'Workspace summary',
      content: { 'application/json': { schema: organizationWorkspaceResponseSchema } },
    },
  },
});

export const organizationListsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(branches, async (c) =>
    c.json(
      await service.branches(
        {
          userId: c.get('user')!.id,
          organizationId: c.get('session')!.activeOrganizationId!,
          activeTeamId: c.get('session')!.activeTeamId ?? null,
        },
        c.req.valid('query'),
      ),
      200,
    ),
  )
  .openapi(branch, async (c) =>
    c.json(
      await service.branch(
        { userId: c.get('user')!.id, organizationId: c.get('session')!.activeOrganizationId! },
        c.req.valid('param').branchId,
      ),
      200,
    ),
  )
  .openapi(branchMembers, async (c) =>
    c.json(
      await service.branchMembers(
        { userId: c.get('user')!.id, organizationId: c.get('session')!.activeOrganizationId! },
        c.req.valid('param').branchId,
        c.req.valid('query'),
      ),
      200,
    ),
  )
  .openapi(members, async (c) =>
    c.json(
      await service.members(
        { userId: c.get('user')!.id, organizationId: c.get('session')!.activeOrganizationId! },
        c.req.valid('query'),
      ),
      200,
    ),
  )
  .openapi(invitations, async (c) =>
    c.json(
      await service.invitations(
        { userId: c.get('user')!.id, organizationId: c.get('session')!.activeOrganizationId! },
        c.req.valid('query'),
      ),
      200,
    ),
  )
  .openapi(summary, async (c) =>
    c.json(
      await service.summary({
        userId: c.get('user')!.id,
        organizationId: c.get('session')!.activeOrganizationId!,
      }),
      200,
    ),
  );
