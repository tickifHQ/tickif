import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { db } from './client.js';
import * as schema from './schema/index.js';

/**
 * Test-only helpers. NEVER import this from application code.
 *
 * Note on which `db` these use: during integration tests the Vitest config sets
 * `DATABASE_URL` to the test DB *before* @repo/config loads, so the shared
 * singleton `db` (imported above) already points at the test database. We still
 * guard every destructive op on the database name ending in `_test`.
 */

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Migrate a fresh connection to `url`. Used by Vitest globalSetup (main process). */
export async function migrateTestDb(url: string): Promise<void> {
  if (!url.endsWith('_test')) {
    throw new Error(`migrateTestDb refuses a non-_test database: ${url}`);
  }
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool, { schema, casing: 'snake_case' }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** Throws unless the singleton `db` is connected to a `*_test` database. */
export async function assertTestDb(): Promise<void> {
  const res = await db.execute<{ db: string }>(sql`SELECT current_database() AS db`);
  const name = res.rows[0]?.db ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing destructive test op on non-test database "${name}"`);
  }
}

/** Truncate every table (except the migrations bookkeeping table). Guarded. */
export async function truncateAll(): Promise<void> {
  await assertTestDb();
  const res = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
  );
  const names = res.rows.map((r) => `"${r.tablename}"`);
  if (names.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY CASCADE`));
}

// --- data factories -------------------------------------------------------

let seq = 0;
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${seq++}`;

export async function makeUser(overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const id = overrides.id ?? uid('user');
  const [row] = await db
    .insert(schema.user)
    .values({
      id,
      name: overrides.name ?? 'Test User',
      email: overrides.email ?? `${id}@test.local`,
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeOrganization(
  overrides: Partial<typeof schema.organization.$inferInsert> = {},
) {
  const id = overrides.id ?? uid('org');
  const [row] = await db
    .insert(schema.organization)
    .values({
      id,
      name: overrides.name ?? 'Test Org',
      slug: overrides.slug ?? `test-org-${id}`,
      createdAt: overrides.createdAt ?? new Date(),
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeDesigner(
  overrides: Partial<typeof schema.designerProfile.$inferInsert> = {},
) {
  const userId = overrides.userId ?? (await makeUser()).id;
  const orgId = overrides.orgId ?? (await makeOrganization()).id;
  const [row] = await db
    .insert(schema.designerProfile)
    .values({
      userId,
      orgId,
      displayName: overrides.displayName ?? 'Test Studio',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeProject(overrides: Partial<typeof schema.project.$inferInsert> = {}) {
  const designerId = overrides.designerId ?? (await makeDesigner()).id;
  const title = overrides.title ?? 'Test Project';
  const [row] = await db
    .insert(schema.project)
    .values({
      designerId,
      title,
      slug: overrides.slug ?? `${title.toLowerCase().replace(/\s+/g, '-')}-${uid('s')}`,
      status: overrides.status ?? 'published',
      citySlug: overrides.citySlug ?? 'mumbai',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeTaxonomy(overrides: Partial<typeof schema.taxonomy.$inferInsert> = {}) {
  const kind = overrides.kind ?? 'room';
  const label = overrides.label ?? 'Living Room';
  const [row] = await db
    .insert(schema.taxonomy)
    .values({
      kind,
      slug:
        overrides.slug ??
        `${label
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')}-${uid('tax')}`,
      label,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeProjectRoom(
  overrides: Partial<typeof schema.projectRoom.$inferInsert> = {},
) {
  const projectId = overrides.projectId ?? (await makeProject()).id;
  const roomTypeId = overrides.roomTypeId ?? (await makeTaxonomy({ kind: 'room' })).id;
  const [row] = await db
    .insert(schema.projectRoom)
    .values({
      projectId,
      roomTypeId,
      name: overrides.name ?? 'Living Room',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeProjectImage(
  overrides: Partial<typeof schema.projectImage.$inferInsert> = {},
) {
  const projectId = overrides.projectId ?? (await makeProject()).id;
  const [row] = await db
    .insert(schema.projectImage)
    .values({
      projectId,
      originalKey: overrides.originalKey ?? `orig/${uid('img')}.jpg`,
      contentType: overrides.contentType ?? 'image/jpeg',
      ...overrides,
    })
    .returning();
  return row!;
}
