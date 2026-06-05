import { migrateTestDb } from '@repo/db/testing';
import { connection, QUEUES } from '@repo/queue';
import { testDatabaseUrl } from '@repo/vitest-config/node';
import { Queue } from 'bullmq';

/** Runs once before the integration project: migrate the test DB. */
export default async function setup() {
  const url = testDatabaseUrl();
  await migrateTestDb(url);
  const smsQueue = new Queue(QUEUES.sms, { connection });
  await smsQueue.obliterate({ force: true });
  await smsQueue.close();
  // Visible confirmation that integration tests target a *_test database.
  console.log(`[test] integration DB migrated: ${url.replace(/:[^:@/]+@/, ':***@')}`);
}
