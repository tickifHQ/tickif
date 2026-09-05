import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { healthResponseSchema, readinessResponseSchema } from '@repo/contracts';
import { getReadiness } from './service.js';

const tags = ['Diagnostics'];

const liveRoute = createRoute({
  method: 'get',
  path: '/livez',
  tags,
  summary: 'Process liveness probe',
  responses: {
    200: {
      description: 'Process is alive',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/readyz',
  tags,
  summary: 'Traffic readiness probe',
  responses: {
    200: {
      description: 'Postgres is reachable',
      content: { 'application/json': { schema: readinessResponseSchema } },
    },
    503: {
      description: 'Process is draining or Postgres is unavailable',
      content: { 'application/json': { schema: readinessResponseSchema } },
    },
  },
});

export const healthRoutes = new OpenAPIHono()
  .openapi(liveRoute, (c) => c.json({ status: 'ok', service: 'tickif-api' } as const, 200))
  .openapi(readyRoute, async (c) => {
    const result = await getReadiness();
    return result.ready ? c.json(result.body, 200) : c.json(result.body, 503);
  })
  // Compatibility endpoint: historically /health was the API probe. It now has
  // readiness semantics so old monitors stop sending traffic when Postgres is down.
  .get('/health', async (c) => {
    const result = await getReadiness();
    return c.json(result.body, result.ready ? 200 : 503);
  });
