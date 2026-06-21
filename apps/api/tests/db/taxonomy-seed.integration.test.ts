import { describe, it, expect } from 'vitest';
import { db, schema, sql } from '@repo/db';
import { seedTaxonomy } from '@repo/db/testing';

/**
 * E-33 / E-94 — Taxonomy seed idempotency and data integrity tests.
 *
 * Proves:
 * - Seed populates all taxonomy kinds
 * - Re-seed produces no duplicates (idempotent)
 * - Localities are nested under cities
 * - Budget bands carry valid metadata (min/max)
 * - Sort order is applied
 */

/** All expected kinds from the schema enum — single source of truth. */
const ALL_KINDS = schema.taxonomyKindEnum.enumValues;

describe('Taxonomy seed (E-33)', () => {
  describe('seed populates all kinds', () => {
    it('every enum kind has at least one seeded term', async () => {
      await seedTaxonomy();

      const result = await db
        .select({
          kind: schema.taxonomy.kind,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(schema.taxonomy)
        .groupBy(schema.taxonomy.kind);

      const seededKinds = result.map((r) => r.kind);

      for (const kind of ALL_KINDS) {
        expect(seededKinds, `kind '${kind}' should be seeded`).toContain(kind);
      }

      // Every kind has at least 1 term
      for (const row of result) {
        expect(row.count).toBeGreaterThan(0);
      }
    });
  });

  describe('seed is idempotent', () => {
    it('re-seeding produces identical total count', async () => {
      await seedTaxonomy();
      const [first] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.taxonomy);

      await seedTaxonomy();
      const [second] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.taxonomy);

      expect(second!.count).toBe(first!.count);
    });
  });

  describe('locality hierarchy', () => {
    it('all localities have a parent city', async () => {
      await seedTaxonomy();

      const orphans = await db
        .select({ id: schema.taxonomy.id })
        .from(schema.taxonomy)
        .where(
          sql`${schema.taxonomy.kind} = 'locality' AND ${schema.taxonomy.parentId} IS NULL`,
        );

      expect(orphans).toHaveLength(0);
    });

    it('locality parents are cities', async () => {
      await seedTaxonomy();

      // Get all distinct parent IDs used by localities
      const localityParents = await db
        .select({ parentId: schema.taxonomy.parentId })
        .from(schema.taxonomy)
        .where(sql`${schema.taxonomy.kind} = 'locality' AND ${schema.taxonomy.parentId} IS NOT NULL`);

      const parentIds = [...new Set(localityParents.map((r) => r.parentId!))];
      expect(parentIds.length).toBeGreaterThan(0);

      // Verify all parents are cities
      const parentKinds = await db
        .select({ kind: schema.taxonomy.kind })
        .from(schema.taxonomy)
        .where(sql`${schema.taxonomy.id} IN (${sql.join(parentIds.map(id => sql`${id}`), sql`, `)})`);

      for (const row of parentKinds) {
        expect(row.kind).toBe('city');
      }
    });
  });

  describe('budget-band metadata', () => {
    it('all budget bands have min/max in metadata', async () => {
      await seedTaxonomy();

      const bands = await db
        .select({
          slug: schema.taxonomy.slug,
          metadata: schema.taxonomy.metadata,
        })
        .from(schema.taxonomy)
        .where(sql`${schema.taxonomy.kind} = 'budget_band'`);

      expect(bands).toHaveLength(4);

      for (const band of bands) {
        const meta = band.metadata as { min?: number; max?: number | null };
        expect(meta).toHaveProperty('min');
        expect(meta).toHaveProperty('max');
        expect(typeof meta.min).toBe('number');
        // max can be null (luxury band has no ceiling)
        expect(meta.max === null || typeof meta.max === 'number').toBe(true);
      }
    });

    it('budget bands are ordered correctly', async () => {
      await seedTaxonomy();

      const bands = await db
        .select({
          slug: schema.taxonomy.slug,
          metadata: schema.taxonomy.metadata,
        })
        .from(schema.taxonomy)
        .where(sql`${schema.taxonomy.kind} = 'budget_band'`)
        .orderBy(schema.taxonomy.sortOrder);

      const slugs = bands.map((b) => b.slug);
      expect(slugs).toEqual(['budget', 'moderate', 'upscale', 'luxury']);
    });
  });

  describe('sort order', () => {
    it('terms within a kind are seeded with ascending sortOrder', async () => {
      await seedTaxonomy();

      const cities = await db
        .select({ slug: schema.taxonomy.slug, sortOrder: schema.taxonomy.sortOrder })
        .from(schema.taxonomy)
        .where(sql`${schema.taxonomy.kind} = 'city'`)
        .orderBy(schema.taxonomy.sortOrder);

      // First city should have sortOrder 1
      expect(cities[0]!.sortOrder).toBe(1);
      // Each subsequent sortOrder should be >= previous
      for (let i = 1; i < cities.length; i++) {
        expect(cities[i]!.sortOrder).toBeGreaterThanOrEqual(cities[i - 1]!.sortOrder);
      }
    });
  });
});
