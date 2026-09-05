import { installTestEnv, workerTestDatabaseUrl } from '@repo/vitest-config/node';
import type { TestProject } from 'vitest/node';

/** Migrate the worker's own test DB once before the integration project. */
export default async function setup(project: TestProject) {
  const restoreEnvironment = installTestEnv(project.config.env);
  const { migrateTestDb } = await import('@repo/db/testing');
  await migrateTestDb(workerTestDatabaseUrl());
  return restoreEnvironment;
}
