import { serve } from '@hono/node-server';
import { config } from '@repo/config';
import { app } from './app.js';

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[api] Homefolio API listening on http://localhost:${info.port}`);
  console.log(`[api] Scalar docs:    http://localhost:${info.port}/docs`);
  console.log(`[api] OpenAPI spec:   http://localhost:${info.port}/openapi.json`);
});
