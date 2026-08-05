import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { errorResponseSchema, organizationWorkspaceResponseSchema } from '@repo/contracts';
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

export const orgsRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
}).openapi(currentWorkspaceRoute, async (c) => {
  const user = c.get('user');
  if (!user) throw AppError.unauthorized();
  const result = await orgsService.getCurrentWorkspace({
    userId: user.id,
    activeOrgId: c.get('session')?.activeOrganizationId ?? null,
  });
  return c.json(result, 200);
});

export type OrgsRoutes = typeof orgsRoutes;
