import { serve } from '@hono/node-server';
import { assertProductionSearchConfig, config, isProduction } from '@repo/config';
import { bootstrapSearch } from '@repo/search';
import { assertMediaStorageConfig } from '@repo/storage';
import { app } from './app.js';
import { closeRedisCache } from './lib/redis.js';
import { beginDraining, closePostgres } from './modules/health/service.js';
import { seedSystemAdmin } from './modules/system-admin/service.js';
import { shutdownTelemetry } from '@repo/telemetry/node';
import { log } from './lib/logger.js';

// The API mints presigned upload URLs, so a prod boot must have R2 wired — fail fast here.
if (isProduction) assertMediaStorageConfig();

// Credentials are a static env check, not an availability dependency, so they fail fast
// alongside R2. Without this a prod boot missing TYPESENSE_SEARCH_API_KEY silently resolves
// it to the admin key and signs every public query with it. Reachability stays non-blocking
// below — that is the part Postgres covers for.
if (isProduction) assertProductionSearchConfig();

// Complete provisioning before accepting authentication requests.
await seedSystemAdmin();

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log.info({ event: 'server.started', port: info.port });

  // Postgres is authoritative, so an unreachable Typesense or unapplied schema drift must
  // not prevent the API from serving traffic. Search reads degrade; nothing else does.
  void bootstrapSearch().catch((error: unknown) => {
    log.error({ event: 'search.bootstrap.failed', err: error }, 'Search reads may be degraded');
  });
});

let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  beginDraining();
  log.info({ event: 'server.draining', signal });

  const forceExit = setTimeout(() => {
    log.error({ event: 'server.shutdown.timeout' });
    process.exit(1);
  }, 25_000);
  forceExit.unref();

  let exitCode = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await Promise.all([closeRedisCache(), closePostgres()]);
    log.info({ event: 'server.shutdown.complete' });
  } catch (error) {
    log.error({ event: 'server.shutdown.failed', err: error });
    exitCode = 1;
  } finally {
    // Exporter shutdown consumes the same 25s application deadline, never extra time.
    const flushed = await shutdownTelemetry(3_000);
    if (!flushed) log.warn({ event: 'telemetry.shutdown.timeout' });
    await log.flush();
    clearTimeout(forceExit);
    process.exit(exitCode);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
