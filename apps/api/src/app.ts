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
const app = new OpenAPIHono<{ Variables: AuthVariables }>({
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

app.onError(onError);

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [config.NEXT_PUBLIC_API_URL, 'http://localhost:3000'],
    credentials: true,
  }),
);
app.use('*', withSession);

// better-auth owns everything under /api/auth/* (sign-in, OTP, OAuth, session).
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// OpenAPI security scheme: better-auth issues a session cookie.
app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'better-auth.session_token',
});

// Domain modules.
const routes = app
  .route('/api/projects', projectsRoutes)
  .get('/health', (c) => c.json({ status: 'ok', service: 'homefolio-api' }));

// OpenAPI document + Scalar reference UI.
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Homefolio API', version: '0.1.0' },
});
app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Homefolio API' }));

export { app };
/** Exported for the web app's type-safe `hc<AppType>` client. */
export type AppType = typeof routes;
