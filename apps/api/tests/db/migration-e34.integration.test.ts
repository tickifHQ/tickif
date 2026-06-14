import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// @ts-expect-error — @types/pg lives in @repo/db devDeps
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E-34 Migration safety test (reviewer requirement).
 *
 * Uses a DEDICATED temporary database to prove that migration 0008 (expand)
 * succeeds on a populated designer_profile table and backfills data correctly.
 *
 * Flow:
 * 1. Create temp DB
 * 2. Apply migrations 0000–0007 (pre-E34 state)
 * 3. Seed a designer_profile row with old schema columns
 * 4. Apply 0008 (expand) — verify backfill + preservation
 * 5. Apply 0009 (contract) — verify old columns removed
 */

const TEMP_DB = 'tickif_migration_e34_test';
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'packages', 'db', 'migrations',
);

/** Read a migration file, strip comments, split on breakpoints, return executable statements. */
function readStatements(filename: string): string[] {
  const raw = readFileSync(join(migrationsDir, filename), 'utf-8');
  return raw
    .split('--> statement-breakpoint')
    .map((s) =>
      s.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n').trim(),
    )
    .filter((s) => s.length > 0);
}

/** Execute a list of SQL statements sequentially. Logs the failing statement on error. */
async function execStatements(pool: Pool, statements: string[]): Promise<void> {
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      console.error('FAILED STATEMENT:', stmt.substring(0, 200));
      throw err;
    }
  }
}

/** Get the list of migration files for indices 0..N (inclusive). */
function getMigrationFiles(upTo: number): string[] {
  const files: string[] = [];
  const allFiles = readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf-8');
  const journal = JSON.parse(allFiles);
  for (const entry of journal.entries) {
    if (entry.idx > upTo) break;
    files.push(`${entry.tag}.sql`);
  }
  return files;
}

describe('E-34 migration safety on populated designer_profile', () => {
  let adminPool: Pool;
  let testPool: Pool;

  beforeAll(async () => {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) throw new Error('DATABASE_URL must be set');

    adminPool = new Pool({ connectionString: baseUrl });
    await adminPool.query(`DROP DATABASE IF EXISTS "${TEMP_DB}"`);
    await adminPool.query(`CREATE DATABASE "${TEMP_DB}"`);

    const tempUrl = baseUrl.replace(/\/[^/]+$/, `/${TEMP_DB}`);
    testPool = new Pool({ connectionString: tempUrl });
  }, 30000);

  afterAll(async () => {
    await testPool?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${TEMP_DB}"`);
    await adminPool?.end();
  });

  it('preserves and backfills existing data through expand (0008) + contract (0009)', async () => {
    // 1. Apply migrations 0000–0007 (pre-E34 state)
    const preE34Files = getMigrationFiles(7);
    for (const file of preE34Files) {
      await execStatements(testPool, readStatements(file));
    }

    // 2. Seed pre-E34 data (old schema: studio_name, city_slug, is_verified)
    await testPool.query(`
      INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, banned, status)
      VALUES ('user-1', 'Test Designer', 'test@example.com', true, NOW(), NOW(), 'visitor', false, 'pending');
    `);
    await testPool.query(`
      INSERT INTO "organization" (id, name, slug, created_at)
      VALUES ('org-1', 'Test Org', 'test-org', '2026-01-01');
    `);
    await testPool.query(`
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES ('mem-1', 'org-1', 'user-1', 'owner', '2026-01-01');
    `);
    await testPool.query(`
      INSERT INTO "designer_profile" (user_id, studio_name, bio, city_slug, is_verified, created_at, updated_at)
      VALUES ('user-1', 'My Studio', 'A great bio', 'mumbai', true, NOW(), NOW());
    `);

    // Verify pre-migration state
    const before = await testPool.query('SELECT * FROM designer_profile');
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].studio_name).toBe('My Studio');

    // 3. Apply migration 0008 (expand)
    const [expand] = getMigrationFiles(8).slice(-1);
    await execStatements(testPool, readStatements(expand!));

    // 4. Verify: row survived, data backfilled
    const afterExpand = await testPool.query('SELECT * FROM designer_profile');
    expect(afterExpand.rows).toHaveLength(1);

    const row = afterExpand.rows[0];
    expect(row.display_name).toBe('My Studio'); // backfilled from studio_name
    expect(row.org_id).toBe('org-1'); // backfilled from membership (deterministic)
    expect(row.user_id).toBe('user-1'); // preserved (now nullable)
    expect(row.entity_type).toBe('individual'); // default
    expect(row.status).toBe('draft'); // default
    expect(row.bio).toBe('A great bio'); // untouched
    expect(row.years_experience).toBe(0); // default

    // Old columns still present after expand (not dropped until contract)
    expect(row.studio_name).toBe('My Studio');
    expect(row.city_slug).toBe('mumbai');
    expect(row.is_verified).toBe(true);

    // 5. Apply migration 0009 (contract)
    const [contract] = getMigrationFiles(9).slice(-1);
    await execStatements(testPool, readStatements(contract!));

    // 6. Verify: old columns removed
    const afterContract = await testPool.query('SELECT * FROM designer_profile');
    const finalRow = afterContract.rows[0];
    expect(finalRow).not.toHaveProperty('studio_name');
    expect(finalRow).not.toHaveProperty('city_slug');
    expect(finalRow).not.toHaveProperty('is_verified');

    // Data still intact
    expect(finalRow.display_name).toBe('My Studio');
    expect(finalRow.org_id).toBe('org-1');
  });
});
