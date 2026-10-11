import { db, schema, eq, and, asc, sql } from '@repo/db';
import type { TaxonomyKind } from '@repo/contracts';

/**
 * Data-access for taxonomy public reads.
 * Repository ALWAYS filters by is_active = true — inactive terms are never exposed.
 */

export type TaxonomyTermRow = {
  id: string;
  label: string;
  slug: string;
  parentId: string | null;
};

export const taxonomyRepository = {
  async createRoom(label: string, slug: string): Promise<TaxonomyTermRow | null> {
    const [term] = await db
      .insert(schema.taxonomy)
      .values({ kind: 'room', label, slug })
      .onConflictDoNothing({
        target: [schema.taxonomy.kind, schema.taxonomy.slug],
        where: sql`${schema.taxonomy.parentId} IS NULL`,
      })
      .returning({
        id: schema.taxonomy.id,
        label: schema.taxonomy.label,
        slug: schema.taxonomy.slug,
        parentId: schema.taxonomy.parentId,
      });
    if (term) return term;
    const [existing] = await db
      .select({
        id: schema.taxonomy.id,
        label: schema.taxonomy.label,
        slug: schema.taxonomy.slug,
        parentId: schema.taxonomy.parentId,
        isActive: schema.taxonomy.isActive,
      })
      .from(schema.taxonomy)
      .where(and(eq(schema.taxonomy.kind, 'room'), eq(schema.taxonomy.slug, slug)));
    if (!existing?.isActive) return null;
    return {
      id: existing.id,
      label: existing.label,
      slug: existing.slug,
      parentId: existing.parentId,
    };
  },
  /**
   * List active taxonomy terms by kind, optionally filtered by parentId.
   * Always filters is_active = true. Orders by sort_order ASC, label ASC.
   */
  async listByKind(kind: TaxonomyKind, parentId?: string): Promise<TaxonomyTermRow[]> {
    const conditions = [eq(schema.taxonomy.kind, kind), eq(schema.taxonomy.isActive, true)];

    if (parentId) {
      conditions.push(eq(schema.taxonomy.parentId, parentId));
    }

    const rows = await db
      .select({
        id: schema.taxonomy.id,
        label: schema.taxonomy.label,
        slug: schema.taxonomy.slug,
        parentId: schema.taxonomy.parentId,
      })
      .from(schema.taxonomy)
      .where(and(...conditions))
      .orderBy(asc(schema.taxonomy.sortOrder), asc(schema.taxonomy.label));

    return rows;
  },
};
