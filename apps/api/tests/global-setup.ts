import { installTestEnv, testDatabaseUrl, testRedisUrl } from '@repo/vitest-config/node';
import { Queue } from 'bullmq';
import type { TestProject } from 'vitest/node';

/** Runs once before the integration project: migrate the test DB + clear the test sms queue. */
export default async function setup(project: TestProject) {
  const restoreEnvironment = installTestEnv(project.config.env);
  try {
    const { migrateTestDb } = await import('@repo/db/testing');
    const { QUEUES } = await import('@repo/queue');
    const url = testDatabaseUrl();
    await migrateTestDb(url);

    // Clear the sms queue, but only on a dedicated test Redis DB index — never the
    // dev default (`/0`), so the destructive obliterate can't wipe real queue data.
    const redisUrl = testRedisUrl();
    const dbIndex = new URL(redisUrl).pathname.replace(/^\//, '');
    if (!dbIndex || dbIndex === '0') {
      throw new Error(
        `Refusing to obliterate the sms queue on a non-test Redis (${redisUrl}). ` +
          `Set REDIS_URL_TEST to a dedicated DB index, e.g. redis://localhost:6379/15.`,
      );
    }
    const smsQueue = new Queue(QUEUES.sms, {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
    });
    try {
      await smsQueue.obliterate({ force: true });
    } finally {
      await smsQueue.close();
    }

    // Visible confirmation that integration tests target a *_test database.
    console.log(`[test] integration DB migrated: ${url.replace(/:[^:@/]+@/, ':***@')}`);
    return restoreEnvironment;
  } catch (error) {
    restoreEnvironment();
    throw error;
  }
}
