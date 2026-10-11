import { db, schema, eq, and } from '@repo/db';
import type { TaxonomyTerm } from '@repo/contracts';

const selection = {
  id: schema.taxonomy.id,
  label: schema.taxonomy.label,
  slug: schema.taxonomy.slug,
  parentId: schema.taxonomy.parentId,
};

export const locationsRepository = {
  async findCity(slug: string): Promise<TaxonomyTerm | null> {
    const [city] = await db
      .select(selection)
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.kind, 'city'),
          eq(schema.taxonomy.slug, slug),
          eq(schema.taxonomy.isActive, true),
        ),
      );
    return city ?? null;
  },
  async ensureCity(label: string, slug: string): Promise<TaxonomyTerm | null> {
    await db.insert(schema.taxonomy).values({ kind: 'city', label, slug }).onConflictDoNothing();
    return this.findCity(slug);
  },
  async ensureLocality(
    parentId: string,
    label: string,
    slug: string,
  ): Promise<TaxonomyTerm | null> {
    await db
      .insert(schema.taxonomy)
      .values({ kind: 'locality', parentId, label, slug })
      .onConflictDoNothing();
    const [locality] = await db
      .select(selection)
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.kind, 'locality'),
          eq(schema.taxonomy.parentId, parentId),
          eq(schema.taxonomy.slug, slug),
          eq(schema.taxonomy.isActive, true),
        ),
      );
    return locality ?? null;
  },
};
