import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// @ts-expect-error — @types/pg lives in @repo/db devDeps
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * E-34 Migration safety test (reviewer requirement).
 *
 * Executes the REAL migration file (0008_e34_expand_designer_profile.sql)
 * against a pre-populated designer_profile table to prove:
 * 1. Migration succeeds on populated data.
 * 2. Existing rows are preserved.
 * 3. display_name is backfilled from studio_name.
 * 4. org_id is backfilled from membership.
 *
 * Uses an isolated schema to avoid interfering with other integration tests.
 */

const TEST_SCHEMA = 'e34_migration_test';
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'packages', 'db', 'migrations',
);

/**
 * Read the real migration file and strip Drizzle's statement-breakpoint markers,
 * then split into executable statements.
 */
function readMigrationStatements(filename: string): string[] {
  const raw = readFileSync(join(migrationsDir, filename), 'utf-8');
  return raw
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))
    // Skip CREATE TYPE statements — enums already exist from the global migration setup.
    // The test validates data migration (backfill), not enum creation.
    .filter((s) => !s.startsWith('CREATE TYPE'));
}

describe('E-34 migration safety on populated designer_profile', () => {
  let pool: Pool;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL must be set');
    pool = new Pool({ connectionString: url });
    await pool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${TEST_SCHEMA}"`);
  });

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await pool.end();
  });

  it('applies 0008 expand on a populated table — preserves and backfills data', async () => {
    await pool.query(`SET search_path TO "${TEST_SCHEMA}", public`);

    // Create pre-E34 tables (matching 0000–0007 state)
    await pool.query(`
      CREATE TABLE "user" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "email_verified" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE "organization" (
        "id" text PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text UNIQUE,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "metadata" text
      );
      CREATE TABLE "member" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "role" text NOT NULL DEFAULT 'member',
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE "taxonomy" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "kind" text NOT NULL,
        "slug" text NOT NULL,
        "label" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE "designer_profile" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "studio_name" text NOT NULL,
        "bio" text,
        "city_slug" text,
        "is_verified" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "designer_profile_user_id_user_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
      );
    `);

    // Seed data
    await pool.query(`
      INSERT INTO "user" (id, name, email, email_verified)
      VALUES ('user-1', 'Test Designer', 'test@example.com', true);
      INSERT INTO "organization" (id, name, slug, created_at)
      VALUES ('org-1', 'Test Org', 'test-org', '2026-01-01');
      INSERT INTO "member" (id, organization_id, user_id, role, created_at)
      VALUES ('mem-1', 'org-1', 'user-1', 'owner', '2026-01-01');
      INSERT INTO "designer_profile" (user_id, studio_name, bio, city_slug, is_verified)
      VALUES ('user-1', 'My Studio', 'A bio', 'mumbai', true);
    `);

    // Verify pre-migration state
    const before = await pool.query('SELECT * FROM "designer_profile"');
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].studio_name).toBe('My Studio');

    // Apply the REAL expand migration statements
    const statements = readMigrationStatements('0008_e34_expand_designer_profile.sql');
    for (const stmt of statements) {
      try {
        await pool.query(stmt);
      } catch (err) {
        // Log the failing statement for CI debugging
        console.error('FAILED STATEMENT:', stmt);
        throw err;
      }
    }

    // Verify: row survived, data backfilled
    const after = await pool.query('SELECT * FROM "designer_profile"');
    expect(after.rows).toHaveLength(1);

    const row = after.rows[0];
    expect(row.display_name).toBe('My Studio'); // backfilled from studio_name
    expect(row.org_id).toBe('org-1'); // backfilled from membership (deterministic)
    expect(row.user_id).toBe('user-1'); // preserved (now nullable)
    expect(row.entity_type).toBe('individual'); // default
    expect(row.status).toBe('draft'); // default
    expect(row.bio).toBe('A bio'); // untouched
    expect(row.years_experience).toBe(0); // default

    // Legacy columns still present (not dropped until 0009)
    expect(row.studio_name).toBe('My Studio');
    expect(row.city_slug).toBe('mumbai');

    // Footprint table created
    const fpCheck = await pool.query(`
      SELECT count(*) as cnt FROM information_schema.tables
      WHERE table_schema = '${TEST_SCHEMA}' AND table_name = 'designer_profile_footprint'
    `);
    expect(fpCheck.rows[0].cnt).toBe('1');
  });
});
