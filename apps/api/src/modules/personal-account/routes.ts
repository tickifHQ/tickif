import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  personalAccountSchema,
  updatePersonalAccountSchema,
} from '@repo/contracts';
import { requirePersonalContext, type AuthVariables } from '../../lib/auth-middleware.js';
import { AppError } from '../../lib/errors.js';
import { validationHook } from '../../lib/validation.js';
import { personalAccountService } from './service.js';

const errorJson = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
});
const common = {
  path: '/me' as const,
  tags: ['Personal account'],
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: 'Personal account settings',
      content: { 'application/json': { schema: personalAccountSchema } },
    },
    401: errorJson('Unauthorized'),
    403: errorJson('Personal account access denied'),
    409: errorJson('Settings changed'),
    422: errorJson('Invalid settings'),
  },
};
const getRoute = createRoute({
  ...common,
  middleware: [requirePersonalContext] as const,
  method: 'get',
  summary: 'Read your personal account settings',
});
const updateRoute = createRoute({
  ...common,
  middleware: [requirePersonalContext] as const,
  method: 'patch',
  summary: 'Update your personal account settings',
  request: { body: { content: { 'application/json': { schema: updatePersonalAccountSchema } } } },
});

export const personalAccountRoutes = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: validationHook,
})
  .openapi(getRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    if (!user || !session) throw AppError.unauthorized();
    c.header('Cache-Control', 'private, no-store');
    return c.json(await personalAccountService.access(user.id, session.id), 200);
  })
  .openapi(updateRoute, async (c) => {
    const user = c.get('user');
    const session = c.get('session');
    if (!user || !session) throw AppError.unauthorized();
    c.header('Cache-Control', 'private, no-store');
    return c.json(
      await personalAccountService.access(user.id, session.id, c.req.valid('json')),
      200,
    );
  });
