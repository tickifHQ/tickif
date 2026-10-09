import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { billingCatalogResponseSchema } from '@repo/contracts';
import { catalogService } from './catalog-service.js';

const plansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['Billing'],
  summary: 'Public plan prices and included features',
  responses: {
    200: {
      description: 'Current monthly plan catalogue',
      content: { 'application/json': { schema: billingCatalogResponseSchema } },
    },
  },
});

export const catalogRoutes = new OpenAPIHono().openapi(plansRoute, (c) => {
  const now = new Date();
  const catalog = catalogService.getPlans(now);
  const maxAge = catalog.earlyBird
    ? Math.min(
        300,
        Math.max(0, Math.floor((Date.parse(catalog.earlyBird.claimBefore) - now.getTime()) / 1000)),
      )
    : 300;
  c.header('Cache-Control', `public, max-age=${maxAge}`);
  return c.json(catalog, 200);
});
