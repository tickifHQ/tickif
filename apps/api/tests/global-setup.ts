import { migrateTestDb } from '@repo/db/testing';
import { testDatabaseUrl } from '@repo/vitest-config/node';

/** Runs once before the integration project: migrate the test DB. */
export default async function setup() {
  const url = testDatabaseUrl();
  await migrateTestDb(url);
  // Visible confirmation that integration tests target a *_test database.
  console.log(`[test] integration DB migrated: ${url.replace(/:[^:@/]+@/, ':***@')}`);
}
