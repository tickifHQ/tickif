import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from '@repo/auth';
import { config } from '@repo/config';
import { onError } from './lib/errors.js';
import { withSession, type AuthVariables } from './lib/auth-middleware.js';
import { projectsRoutes } from './modules/projects/routes.js';

/**
 * App composition — the modular monolith.
 *
 * Cross-cutting concerns (logging, CORS, session) are applied once here, then
 * each domain module is mounted under /api. New modules (designers, media,
 * leads, search, billing, ...) plug in with a single `.route()` call.
 */
const base = new OpenAPIHono<{ Variables: AuthVariables }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'validation_error',
            message: 'Request validation failed',
            details: result.error.issues,
          },
        },
        422,
      );
    }
  },
});

base.onError(onError);

base.use('*', logger());
base.use(
  '*',
  cors({
    origin: [config.NEXT_PUBLIC_API_URL, 'http://localhost:3000'],
    credentials: true,
  }),
);
base.use('*', withSession);

// better-auth owns everything under /api/auth/* (sign-in, OTP, OAuth, session).
base.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// OpenAPI security scheme: better-auth issues a session cookie.
base.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'better-auth.session_token',
});

// OpenAPI document + Scalar reference UI (generated lazily from the registry).
base.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Homefolio API', version: '0.1.0' },
});
base.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Homefolio API' }));

// Domain modules. `app` is the chained (fully-typed) value — exported so both
// the server and the web app's `hc<AppType>` client see every route.
export const app = base
  .route('/api/projects', projectsRoutes)
  .get('/health', (c) => c.json({ status: 'ok', service: 'homefolio-api' }));

/** Exported for the web app's type-safe `hc<AppType>` client. */
export type AppType = typeof app;
