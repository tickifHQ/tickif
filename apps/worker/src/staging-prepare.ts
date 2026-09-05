import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import Redis from 'ioredis';
import { assertProductionEmailConfig, assertProductionSearchConfig, config } from '@repo/config';
import {
  bootstrapSearch,
  searchWriteClient,
  projectsCollection,
  designersCollection,
} from '@repo/search';
import { rebuildSearchCollections } from './search/rebuild.js';
import { probeDatabase } from './staging/repository.js';

// One-shot release CLI, never started by a normal worker. The release script stops
// app writers first. Await the actual rebuild/alias swap, not only a queued job.
async function main(): Promise<void> {
  assertProductionEmailConfig();
  assertProductionSearchConfig();
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await probeDatabase();
        if (redis.status !== 'ready') await redis.connect();
        await redis.ping();
        const health = await searchWriteClient().health.retrieve();
        if (!health.ok) throw new Error('Search unavailable');
        break;
      } catch {
        redis.disconnect();
        if (attempt >= 29)
          throw new Error('Infrastructure did not become ready within the release startup window');
        await setTimeout(2000);
      }
    }
  } finally {
    redis.disconnect();
  }
  for (const command of ['migrate', 'seed']) {
    const result = spawnSync('pnpm', ['--filter', '@repo/db', command], { stdio: 'inherit' });
    if (result.error || result.status !== 0)
      throw new Error(`Database ${command} failed; traffic remains closed`);
  }
  await bootstrapSearch({ applyUpdates: true });
  console.log('[staging] database and search schema prepared; rebuilding search');
  const result = await rebuildSearchCollections(Date.now(), 0);
  // Verify the distinct query key is actually provisioned, not just a different string.
  await projectsCollection().documents().search({ q: '*', per_page: 1 });
  await designersCollection().documents().search({ q: '*', per_page: 1 });
  console.log(
    `[staging] search rebuilt: ${result.projects} projects, ${result.designers} designers`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(() => {
    // Underlying provider/driver errors may include credentials. Failure detail is
    // deliberately generic here; the migration tool emits its own SQL diagnostics.
    console.error(
      '[staging] preparation failed; inspect infrastructure/schema and retry with traffic closed',
    );
    process.exit(1);
  });
