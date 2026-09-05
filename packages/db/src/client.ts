import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '@repo/config';
import * as schema from './schema/index.js';
import { closeReadinessDatabase } from './readiness.js';

/**
 * Shared pooled Postgres connection + Drizzle instance.
 *
 * The full schema (domain + better-auth tables) is passed here so that
 * better-auth's drizzleAdapter can auto-discover its tables from the same
 * instance — keeping auth and domain data in a single migration set.
 */
// Timeouts bound a stuck client/query so a slow consumer (e.g. the CPU-bound worker
// sharing this pool) can't pin a connection indefinitely.
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});

export const db = drizzle(pool, { schema, casing: 'snake_case' });

/** Stop accepting database work and drain the shared pool during process shutdown. */
export async function closeDatabase(): Promise<void> {
  await Promise.all([pool.end(), closeReadinessDatabase()]);
}

export type DB = typeof db;
