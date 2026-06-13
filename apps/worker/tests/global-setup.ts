import { migrateTestDb } from '@repo/db/testing';
import { testDatabaseUrl } from '@repo/vitest-config/node';

/** Migrate the test DB once before the worker integration project. */
export default async function setup() {
  await migrateTestDb(testDatabaseUrl());
}
