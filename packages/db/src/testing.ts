import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { eq, sql } from 'drizzle-orm';
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

export async function makeTeam(
  overrides: Partial<typeof schema.team.$inferInsert> & { organizationId?: string } = {},
) {
  const organizationId = overrides.organizationId ?? (await makeOrganization()).id;
  const id = overrides.id ?? uid('team');
  const [row] = await db
    .insert(schema.team)
    .values({
      id,
      organizationId,
      name: overrides.name ?? 'Test Branch',
      createdAt: overrides.createdAt ?? new Date(),
      updatedAt: overrides.updatedAt ?? new Date(),
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
  const teamId = overrides.teamId ?? (await makeTeam({ organizationId: orgId })).id;
  const [row] = await db
    .insert(schema.designerProfile)
    .values({
      userId,
      orgId,
      teamId,
      slug: overrides.slug ?? `test-studio-${uid('profile')}`,
      displayName: overrides.displayName ?? 'Test Studio',
      ...overrides,
    })
    .returning();
  await db.insert(schema.teamMember).values({
    id: uid('teamMember'),
    teamId,
    userId,
    createdAt: new Date(),
  });
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

export async function makeProjectReviewComment(
  overrides: Partial<typeof schema.projectReviewComment.$inferInsert> = {},
) {
  const projectId = overrides.projectId ?? (await makeProject({ status: 'changes_requested' })).id;
  const authorId = overrides.authorId ?? (await makeUser({ role: 'admin' })).id;
  const [row] = await db
    .insert(schema.projectReviewComment)
    .values({
      projectId,
      authorId,
      body: overrides.body ?? 'Add clearer room labels.',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeTaxonomy(overrides: Partial<typeof schema.taxonomy.$inferInsert> = {}) {
  const { kind = 'room', label = 'Living Room', slug, ...rest } = overrides;
  const [row] = await db
    .insert(schema.taxonomy)
    .values({
      kind,
      slug:
        slug ??
        `${label
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')}-${Date.now().toString(36)}-${seq++}`,
      label,
      ...rest,
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

export async function makeLead(overrides: Partial<typeof schema.lead.$inferInsert> = {}) {
  const organizationId = overrides.organizationId ?? (await makeOrganization()).id;
  const [existingTeam] = overrides.teamId
    ? []
    : await db
        .select({ id: schema.team.id })
        .from(schema.team)
        .where(eq(schema.team.organizationId, organizationId))
        .orderBy(schema.team.createdAt, schema.team.id)
        .limit(1);
  const teamId = overrides.teamId ?? existingTeam?.id ?? (await makeTeam({ organizationId })).id;
  const [row] = await db
    .insert(schema.lead)
    .values({
      organizationId,
      teamId,
      name: overrides.name ?? 'Test Lead',
      contactNumber: overrides.contactNumber ?? '+919800000000',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeConsultationBooking(
  overrides: Partial<typeof schema.consultationBooking.$inferInsert> = {},
) {
  const { preferredSlots, ...bookingOverrides } = overrides;
  const designer = overrides.designerProfileId
    ? null
    : await makeDesigner({ status: 'active', phone: '+919800000099' });
  const designerProfileId = overrides.designerProfileId ?? designer!.id;
  const organizationId =
    overrides.organizationId ??
    designer?.orgId ??
    (
      await db
        .select({ organizationId: schema.designerProfile.orgId })
        .from(schema.designerProfile)
        .where(eq(schema.designerProfile.id, designerProfileId))
        .limit(1)
    )[0]!.organizationId;
  const requesterId = overrides.requesterId ?? (await makeUser()).id;
  const defaultPreferredSlot = bookingOverrides.confirmedSlot ?? {
    date: '2099-01-01',
    window: 'morning' as const,
  };
  const [row] = await db
    .insert(schema.consultationBooking)
    .values({
      organizationId,
      designerProfileId,
      requesterId,
      preferredSlots: preferredSlots ?? [defaultPreferredSlot],
      ...bookingOverrides,
    })
    .returning();
  return row!;
}

export async function makeReview(overrides: Partial<typeof schema.review.$inferInsert> = {}) {
  const designerProfileId = overrides.designerProfileId ?? (await makeDesigner()).id;
  const authorUserId =
    overrides.authorUserId ??
    (await makeUser({ phoneNumber: '+919800000001', phoneNumberVerified: true })).id;
  const [row] = await db
    .insert(schema.review)
    .values({
      designerProfileId,
      authorUserId,
      rating: overrides.rating ?? 5,
      body:
        overrides.body ?? 'A thoughtful and detailed review of the completed design experience.',
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makeSubscription(
  overrides: Partial<typeof schema.subscription.$inferInsert> = {},
) {
  const organizationId = overrides.organizationId ?? (await makeOrganization()).id;
  const state = overrides.subscriptionState ?? 'active';

  // Derive required lifecycle fields from the requested state using relative offsets.
  const now = new Date();
  const graceDelta = 5 * 24 * 60 * 60 * 1000; // 5 days ago
  const lockDelta = 2 * 24 * 60 * 60 * 1000; // 2 days ago

  const stateDefaults: Partial<typeof schema.subscription.$inferInsert> = (() => {
    switch (state) {
      case 'active':
      case 'payment_failed':
        return {};
      case 'grace':
        return {
          planTier: overrides.planTier ?? 'professional_plus',
          graceStartedAt: overrides.graceStartedAt ?? new Date(now.getTime() - graceDelta),
          preLapseTier: overrides.preLapseTier ?? 'professional_plus',
        };
      case 'locked':
        return {
          planTier: overrides.planTier ?? 'professional_plus',
          graceStartedAt: overrides.graceStartedAt ?? new Date(now.getTime() - graceDelta),
          lockedAt: overrides.lockedAt ?? new Date(now.getTime() - lockDelta),
          preLapseTier: overrides.preLapseTier ?? 'professional_plus',
        };
      case 'downgraded':
        return {
          planTier: overrides.planTier ?? 'hobby',
          graceStartedAt: overrides.graceStartedAt ?? new Date(now.getTime() - graceDelta),
          lockedAt: overrides.lockedAt ?? new Date(now.getTime() - lockDelta),
          downgradedAt: overrides.downgradedAt ?? now,
          preLapseTier: overrides.preLapseTier ?? 'professional_plus',
        };
      default:
        return {};
    }
  })();

  const [row] = await db
    .insert(schema.subscription)
    .values({
      organizationId,
      planTier: overrides.planTier ?? 'hobby',
      subscriptionState: state,
      ...stateDefaults,
      ...overrides,
    })
    .returning();
  return row!;
}

export async function makePaymentTransaction(
  overrides: Partial<typeof schema.paymentTransaction.$inferInsert> = {},
) {
  const subscriptionId = overrides.subscriptionId ?? (await makeSubscription()).id;
  const [row] = await db
    .insert(schema.paymentTransaction)
    .values({
      subscriptionId,
      razorpayPaymentId: overrides.razorpayPaymentId ?? `pay_${uid('txn')}`,
      amount: overrides.amount ?? 299900,
      status: overrides.status ?? 'captured',
      payload: overrides.payload ?? { event: 'payment.captured', synthetic: true },
      ...overrides,
    })
    .returning();
  return row!;
}

// --- seed helpers (test-only) -------------------------------------------------

export { seedTaxonomy } from './seeds/taxonomy.js';
