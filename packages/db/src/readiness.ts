import { Pool } from 'pg';
import { config } from '@repo/config';

// Health probes have their own single connection and cannot queue behind application work.
// Connection plus query deadlines fit inside the orchestrator's three-second probe timeout.
const readinessPool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 750,
  idleTimeoutMillis: 1_000,
  statement_timeout: 750,
  query_timeout: 750,
});
// An idle socket failure is availability information, never an uncaught process error.
readinessPool.on('error', () => undefined);
let pending: Promise<boolean> | null = null;

export function isDatabaseReady(): Promise<boolean> {
  if (pending) return pending;
  pending = readinessPool
    .query('select 1')
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      pending = null;
    });
  return pending;
}

export async function closeReadinessDatabase(): Promise<void> {
  await readinessPool.end();
}
