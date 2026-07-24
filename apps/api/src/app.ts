import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from '@repo/auth';
import { config, isProduction } from '@repo/config';
import { onError } from './lib/errors.js';
import { validationHook } from './lib/validation.js';
import { withSession, type AuthVariables } from './lib/auth-middleware.js';
import { projectsRoutes } from './modules/projects/routes.js';
import { mediaRoutes, projectImagesRoutes } from './modules/media/routes.js';
import { profilesRoutes } from './modules/profiles/routes.js';
import { publicPortfolioRoutes } from './modules/profiles/public-portfolio-routes.js';
import { taxonomyRoutes } from './modules/taxonomy/routes.js';
import { leadsRoutes } from './modules/leads/routes.js';
import { discoveryRoutes } from './modules/discovery/routes.js';

// Prod: only the configured trusted origins. Dev: also allow the local web app.
const corsOrigins = isProduction
  ? config.TRUSTED_ORIGINS
  : [config.NEXT_PUBLIC_API_URL, 'http://localhost:3000', ...config.TRUSTED_ORIGINS];

/**
 * App composition — the modular monolith.
 *
 * Cross-cutting concerns (logging, CORS, session) are applied once here, then
 * each domain module is mounted under /api. New modules (designers, media,
 * leads, search, billing, ...) plug in with a single `.route()` call.
 */
const base = new OpenAPIHono<{ Variables: AuthVariables }>({ defaultHook: validationHook });

base.onError(onError);

base.use('*', logger());
base.use('*', cors({ origin: corsOrigins, credentials: true }));
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
  info: { title: 'Tickif API', version: '0.1.0' },
});
base.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Tickif API' }));

// Domain modules. `app` is the chained (fully-typed) value — exported so both
// the server and the web app's `hc<AppType>` client see every route.
export const app = base
  .route('/api/projects', projectsRoutes)
  .route('/api/projects', projectImagesRoutes)
  .route('/api/media', mediaRoutes)
  .route('/api/profiles', profilesRoutes)
  .route('/api/portfolios', publicPortfolioRoutes)
  .route('/api/taxonomy', taxonomyRoutes)
  .route('/api/leads', leadsRoutes)
  .route('/api/discovery', discoveryRoutes)
  .get('/health', (c) => c.json({ status: 'ok', service: 'tickif-api' }));

/** Exported for the web app's type-safe `hc<AppType>` client. */
export type AppType = typeof app;
