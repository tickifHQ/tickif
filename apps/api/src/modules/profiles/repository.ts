import { db, schema, eq, and } from '@repo/db';
import type { EntityType } from '@repo/contracts';

/**
 * Data-access for designer profiles. The ONLY layer that imports Drizzle.
 */

export type ProfileRecord = typeof schema.designerProfile.$inferSelect;

export type CreateProfileData = {
  userId: string;
  entityType: EntityType;
  studioName: string;
  bio?: string;
  citySlug: string;
};

export const profilesRepository = {
  async findByUserId(userId: string): Promise<ProfileRecord | null> {
    const [row] = await db
      .select()
      .from(schema.designerProfile)
      .where(eq(schema.designerProfile.userId, userId))
      .limit(1);
    return row ?? null;
  },

  /**
   * Validate that a slug exists in the taxonomy table for a given kind.
   * // TODO(#6): replace with Taxonomy module API when available.
   */
  async taxonomySlugExists(kind: string, slug: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.taxonomy.id })
      .from(schema.taxonomy)
      .where(
        and(eq(schema.taxonomy.kind, kind as never), eq(schema.taxonomy.slug, slug)),
      )
      .limit(1);
    return !!row;
  },

  /**
   * Validate multiple slugs for a given taxonomy kind.
   * Returns the list of slugs that do NOT exist.
   */
  async findInvalidTaxonomySlugs(kind: string, slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const results = await Promise.all(
      slugs.map(async (slug) => {
        const exists = await this.taxonomySlugExists(kind, slug);
        return exists ? null : slug;
      }),
    );
    return results.filter((s): s is string => s !== null);
  },

  /**
   * Create a designer profile + upgrade user role in a single transaction.
   * Returns the created profile record.
   */
  async createWithRoleUpgrade(data: CreateProfileData): Promise<ProfileRecord> {
    return db.transaction(async (tx) => {
      // Step 1: Create designer_profile
      const [profile] = await tx
        .insert(schema.designerProfile)
        .values({
          userId: data.userId,
          entityType: data.entityType,
          studioName: data.studioName,
          bio: data.bio ?? null,
          citySlug: data.citySlug,
        })
        .returning();

      if (!profile) throw new Error('insert designer_profile returned no row');

      // Step 2: Upgrade user.role to 'designer'
      await tx
        .update(schema.user)
        .set({ role: 'designer' })
        .where(eq(schema.user.id, data.userId));

      return profile;
    });
  },
};
