import { db, schema, eq, and, asc } from '@repo/db';

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
  /**
   * List active taxonomy terms by kind, optionally filtered by parentId.
   * Always filters is_active = true. Orders by sort_order ASC, label ASC.
   */
  async listByKind(
    kind: string,
    parentId?: string,
  ): Promise<TaxonomyTermRow[]> {
    const conditions = [
      eq(schema.taxonomy.kind, kind as typeof schema.taxonomyKindEnum.enumValues[number]),
      eq(schema.taxonomy.isActive, true),
    ];

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
