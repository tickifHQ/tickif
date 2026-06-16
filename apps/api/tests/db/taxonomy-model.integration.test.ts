import { describe, it, expect } from 'vitest';
import { db, schema, eq } from '@repo/db';

/**
 * E-29 Taxonomy model integration tests.
 *
 * Proves database-level constraints work:
 * - Hierarchy enforcement (CHECK constraint)
 * - Slug uniqueness (partial unique indexes)
 * - FK RESTRICT on delete
 * - Slug format CHECK
 */

/**
 * Extract the PostgreSQL error from a Drizzle error.
 * Drizzle wraps PG errors — the constraint/code live on the cause or nested error.
 */
function pgError(err: unknown): { code?: string; constraint?: string } {
  if (!err || typeof err !== 'object') return {};
  // Drizzle may expose it directly or on .cause
  const e = err as Record<string, unknown>;
  if ('code' in e && typeof e.code === 'string') return e as { code: string; constraint?: string };
  if ('cause' in e && e.cause && typeof e.cause === 'object') {
    const cause = e.cause as Record<string, unknown>;
    if ('code' in cause) return cause as { code: string; constraint?: string };
  }
  return {};
}

/** Assert a DB operation fails with a specific constraint violation. */
async function expectConstraintViolation(
  operation: Promise<unknown>,
  expectedConstraint: string,
): Promise<void> {
  try {
    await operation;
    expect.fail(`Expected constraint violation (${expectedConstraint}) but operation succeeded`);
  } catch (err) {
    const pg = pgError(err);
    expect(
      pg.constraint,
      `Expected constraint '${expectedConstraint}' but got: ${JSON.stringify(pg)}`,
    ).toBe(expectedConstraint);
  }
}

/** Assert a DB operation fails with a specific PG error code. */
async function expectPgError(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
    expect.fail(`Expected PG error (${expectedCode}) but operation succeeded`);
  } catch (err) {
    const pg = pgError(err);
    expect(
      pg.code,
      `Expected code '${expectedCode}' but got: ${JSON.stringify(pg)}`,
    ).toBe(expectedCode);
  }
}

describe('Taxonomy model constraints (E-29)', () => {
  // --- Hierarchy enforcement ---

  describe('hierarchy CHECK constraint', () => {
    it('allows locality with a city parent', async () => {
      const [city] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Mumbai', slug: 'mumbai' })
        .returning();

      const [locality] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'locality', label: 'Andheri', slug: 'andheri', parentId: city!.id })
        .returning();

      expect(locality!.parentId).toBe(city!.id);
      expect(locality!.kind).toBe('locality');
    });

    it('rejects locality without a parent', async () => {
      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'locality', label: 'Orphan', slug: 'orphan' }),
        'taxonomy_hierarchy_check',
      );
    });

    it('rejects city with a parent', async () => {
      const [city] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Delhi', slug: 'delhi' })
        .returning();

      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'city', label: 'Bad City', slug: 'bad-city', parentId: city!.id }),
        'taxonomy_hierarchy_check',
      );
    });

    it('rejects room with a parent', async () => {
      const [city] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Pune', slug: 'pune' })
        .returning();

      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'room', label: 'Kitchen', slug: 'kitchen', parentId: city!.id }),
        'taxonomy_hierarchy_check',
      );
    });
  });

  // --- Slug uniqueness ---

  describe('slug uniqueness', () => {
    it('rejects duplicate (kind, slug) for non-locality kinds', async () => {
      await db.insert(schema.taxonomy).values({ kind: 'theme', label: 'Modern', slug: 'modern' });

      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'theme', label: 'Modern 2', slug: 'modern' }),
        'taxonomy_kind_slug_uniq',
      );
    });

    it('allows same slug in different kinds', async () => {
      await db.insert(schema.taxonomy).values({ kind: 'scope', label: 'Premium', slug: 'premium' });

      const [row] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'budget_band', label: 'Premium', slug: 'premium' })
        .returning();

      expect(row!.slug).toBe('premium');
    });

    it('allows same locality slug under different cities', async () => {
      const [mumbai] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Mumbai', slug: 'mumbai-uniq' })
        .returning();

      const [pune] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Pune', slug: 'pune-uniq' })
        .returning();

      await db.insert(schema.taxonomy).values({ kind: 'locality', label: 'Andheri', slug: 'andheri', parentId: mumbai!.id });

      const [puneAndheri] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'locality', label: 'Andheri', slug: 'andheri', parentId: pune!.id })
        .returning();

      expect(puneAndheri!.slug).toBe('andheri');
    });

    it('rejects same locality slug under the same city', async () => {
      const [city] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Bangalore', slug: 'bangalore' })
        .returning();

      await db.insert(schema.taxonomy).values({ kind: 'locality', label: 'Koramangala', slug: 'koramangala', parentId: city!.id });

      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'locality', label: 'Koramangala 2', slug: 'koramangala', parentId: city!.id }),
        'taxonomy_parent_slug_uniq',
      );
    });
  });

  // --- Slug format ---

  describe('slug format CHECK', () => {
    it('rejects uppercase slugs', async () => {
      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'city', label: 'Test', slug: 'Mumbai' }),
        'taxonomy_slug_format_check',
      );
    });

    it('rejects slugs with spaces', async () => {
      await expectConstraintViolation(
        db.insert(schema.taxonomy).values({ kind: 'city', label: 'Test', slug: 'new delhi' }),
        'taxonomy_slug_format_check',
      );
    });

    it('accepts valid lowercase hyphenated slugs', async () => {
      const [row] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'New Delhi', slug: 'new-delhi' })
        .returning();

      expect(row!.slug).toBe('new-delhi');
    });
  });

  // --- FK RESTRICT on delete ---

  describe('ON DELETE RESTRICT (referenced terms cannot be deleted)', () => {
    it('prevents deleting a taxonomy term referenced by a footprint', async () => {
      const [term] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'scope', label: 'Full Home', slug: 'full-home-restrict-test' })
        .returning();

      const { makeDesigner } = await import('@repo/db/testing');
      const designer = await makeDesigner();

      await db.insert(schema.designerProfileFootprint).values({
        profileId: designer.id,
        taxonomyId: term!.id,
      });

      // 23503 = foreign_key_violation
      await expectPgError(
        db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, term!.id)),
        '23503',
      );
    });
  });

  // --- Self-FK RESTRICT (city cannot be deleted while localities exist) ---

  describe('parent FK RESTRICT', () => {
    it('prevents deleting a city that has locality children', async () => {
      const [city] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'city', label: 'Hyderabad', slug: 'hyderabad' })
        .returning();

      await db.insert(schema.taxonomy).values({ kind: 'locality', label: 'Banjara Hills', slug: 'banjara-hills', parentId: city!.id });

      // 23503 = foreign_key_violation
      await expectPgError(
        db.delete(schema.taxonomy).where(eq(schema.taxonomy.id, city!.id)),
        '23503',
      );
    });
  });

  // --- Default values ---

  describe('default values', () => {
    it('creates a term with correct defaults', async () => {
      const [row] = await db
        .insert(schema.taxonomy)
        .values({ kind: 'room', label: 'Living Room', slug: 'living-room' })
        .returning();

      expect(row!.sortOrder).toBe(0);
      expect(row!.isActive).toBe(true);
      expect(row!.metadata).toEqual({});
      expect(row!.parentId).toBeNull();
      expect(row!.updatedAt).toBeDefined();
    });
  });
});
