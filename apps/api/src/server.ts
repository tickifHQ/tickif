import { serve } from '@hono/node-server';
import { config, isProduction } from '@repo/config';
import { assertMediaStorageConfig } from '@repo/storage';
import { app } from './app.js';

// The API mints presigned upload URLs, so a prod boot must have R2 wired — fail fast here.
if (isProduction) assertMediaStorageConfig();

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[api] Tickif API listening on http://localhost:${info.port}`);
  console.log(`[api] Scalar docs:    http://localhost:${info.port}/docs`);
  console.log(`[api] OpenAPI spec:   http://localhost:${info.port}/openapi.json`);
});
