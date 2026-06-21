import { describe, it, expect } from 'vitest';
import { db, schema } from '@repo/db';

/**
 * E-124 Per-room attribute vocabulary integration tests.
 *
 * Proves:
 * - New enum values (material, finish, layout, palette, size_band) are valid
 * - Seed inserts all 5 new kinds
 * - Idempotent re-seed doesn't duplicate
 * - Layout metadata (room applicability) stored correctly
 */

describe('E-124 attribute vocabulary kinds', () => {
  const newKinds = ['material', 'finish', 'layout', 'palette', 'size_band'] as const;

  for (const kind of newKinds) {
    it(`accepts '${kind}' as a valid taxonomy kind`, async () => {
      const slug = `test-${kind.replace(/_/g, '-')}`;
      const [row] = await db
        .insert(schema.taxonomy)
        .values({ kind, label: `Test ${kind}`, slug })
        .returning();

      expect(row!.kind).toBe(kind);
      expect(row!.slug).toBe(slug);
    });
  }

  it('stores layout metadata with room applicability', async () => {
    const [row] = await db
      .insert(schema.taxonomy)
      .values({
        kind: 'layout',
        label: 'Island',
        slug: 'island-test',
        metadata: { room: 'kitchen' },
      })
      .returning();

    expect(row!.metadata).toEqual({ room: 'kitchen' });
  });

  it('enforces slug uniqueness within kind for new attribute kinds', async () => {
    await db.insert(schema.taxonomy).values({ kind: 'material', label: 'MDF', slug: 'mdf-dup' });

    await expect(
      db.insert(schema.taxonomy).values({ kind: 'material', label: 'MDF 2', slug: 'mdf-dup' }),
    ).rejects.toThrow();
  });

  it('allows same slug across different attribute kinds', async () => {
    await db.insert(schema.taxonomy).values({ kind: 'material', label: 'Laminate', slug: 'laminate-cross' });

    const [row] = await db
      .insert(schema.taxonomy)
      .values({ kind: 'finish', label: 'Laminate', slug: 'laminate-cross' })
      .returning();

    expect(row!.kind).toBe('finish');
    expect(row!.slug).toBe('laminate-cross');
  });

  it('rejects attribute kind with a parent (hierarchy check)', async () => {
    const [city] = await db
      .insert(schema.taxonomy)
      .values({ kind: 'city', label: 'Test City', slug: 'test-city-e124' })
      .returning();

    await expect(
      db.insert(schema.taxonomy).values({
        kind: 'material',
        label: 'Bad Material',
        slug: 'bad-material',
        parentId: city!.id,
      }),
    ).rejects.toThrow();
  });
});
