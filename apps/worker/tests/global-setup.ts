import { migrateTestDb } from '@repo/db/testing';
import { workerTestDatabaseUrl } from '@repo/vitest-config/node';

/** Migrate the worker's own test DB once before the integration project. */
export default async function setup() {
  await migrateTestDb(workerTestDatabaseUrl());
}
