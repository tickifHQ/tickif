import { db, schema, eq } from '@repo/db';

/**
 * Data-access for the Google review cache (`google_place_cache`) — API side.
 * Owns the interactive paths (connect/get/disconnect). The periodic sweep +
 * result persistence live in the worker's own repository (deployed separately),
 * mirroring the media pipeline's worker-local repository convention.
 */

export type GooglePlaceCacheRecord = typeof schema.googlePlaceCache.$inferSelect;

/** Fields the API may write when connecting a place. */
export type GooglePlaceCacheWrite = {
  placeId: string;
  status?: GooglePlaceCacheRecord['status'];
  rating?: string | null;
  userRatingsTotal?: number | null;
  reviews?: GooglePlaceCacheRecord['reviews'];
  lastFetchedAt?: Date | null;
  lastError?: string | null;
};

export const googleReviewsRepository = {
  async findByProfileId(profileId: string): Promise<GooglePlaceCacheRecord | null> {
    const [row] = await db
      .select()
      .from(schema.googlePlaceCache)
      .where(eq(schema.googlePlaceCache.profileId, profileId))
      .limit(1);
    return row ?? null;
  },

  /** Upsert the cache row for a profile (profileId is the PK). */
  async upsert(profileId: string, values: GooglePlaceCacheWrite): Promise<GooglePlaceCacheRecord> {
    const now = new Date();
    const [row] = await db
      .insert(schema.googlePlaceCache)
      .values({ profileId, ...values, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.googlePlaceCache.profileId,
        set: { ...values, updatedAt: now },
      })
      .returning();
    if (!row) throw new Error('google_place_cache upsert returned no row');
    return row;
  },

  async delete(profileId: string): Promise<void> {
    await db.delete(schema.googlePlaceCache).where(eq(schema.googlePlaceCache.profileId, profileId));
  },
};
