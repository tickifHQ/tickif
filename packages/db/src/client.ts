import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '@repo/config';
import * as schema from './schema/index.js';

/**
 * Shared pooled Postgres connection + Drizzle instance.
 *
 * The full schema (domain + better-auth tables) is passed here so that
 * better-auth's drizzleAdapter can auto-discover its tables from the same
 * instance — keeping auth and domain data in a single migration set.
 */
const pool = new Pool({ connectionString: config.DATABASE_URL });

export const db = drizzle(pool, { schema, casing: 'snake_case' });

export type DB = typeof db;
