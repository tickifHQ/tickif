import { serve } from '@hono/node-server';
import { assertProductionSearchConfig, config, isProduction } from '@repo/config';
import { bootstrapSearch } from '@repo/search';
import { assertMediaStorageConfig } from '@repo/storage';
import { app } from './app.js';
import { closeRedisCache } from './lib/redis.js';
import { beginDraining, closePostgres } from './modules/health/service.js';

// The API mints presigned upload URLs, so a prod boot must have R2 wired — fail fast here.
if (isProduction) assertMediaStorageConfig();

// Credentials are a static env check, not an availability dependency, so they fail fast
// alongside R2. Without this a prod boot missing TYPESENSE_SEARCH_API_KEY silently resolves
// it to the admin key and signs every public query with it. Reachability stays non-blocking
// below — that is the part Postgres covers for.
if (isProduction) assertProductionSearchConfig();

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`[api] Tickif API listening on http://localhost:${info.port}`);
  console.log(`[api] Scalar docs:    http://localhost:${info.port}/docs`);
  console.log(`[api] OpenAPI spec:   http://localhost:${info.port}/openapi.json`);

  // Postgres is authoritative, so an unreachable Typesense or unapplied schema drift must
  // not prevent the API from serving traffic. Search reads degrade; nothing else does.
  void bootstrapSearch().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api] Search bootstrap failed; search reads may be degraded: ${message}`);
  });
});

let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  beginDraining();
  console.log(`[api] ${signal} received, stopping traffic and draining...`);

  const forceExit = setTimeout(() => {
    console.error('[api] graceful shutdown timed out');
    process.exit(1);
  }, 25_000);
  forceExit.unref();

  let exitCode = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await Promise.all([closeRedisCache(), closePostgres()]);
    console.log('[api] shutdown complete');
  } catch (error) {
    console.error('[api] error during shutdown:', error);
    exitCode = 1;
  } finally {
    clearTimeout(forceExit);
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
