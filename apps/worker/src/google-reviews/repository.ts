import { db, schema, eq, and, or, ne, lt, isNull, inArray } from '@repo/db';
import type { GooglePlaceDetails } from '@repo/google-places';

/**
 * Worker-local data-access for `google_place_cache`. Owns the write path
 * (persisting fetched results) and the periodic sweep queries. Mirrors the
 * media pipeline's worker-local repository convention — the worker deploys
 * separately from the API and keeps its own thin DB layer.
 */

export async function getPlaceId(profileId: string): Promise<string | null> {
  const [row] = await db
    .select({ placeId: schema.googlePlaceCache.placeId })
    .from(schema.googlePlaceCache)
    .where(eq(schema.googlePlaceCache.profileId, profileId))
    .limit(1);
  return row?.placeId ?? null;
}

/** Persist a successful fetch: refresh rating + reviews and mark connected. */
export async function persistResult(profileId: string, details: GooglePlaceDetails): Promise<void> {
  await db
    .update(schema.googlePlaceCache)
    .set({
      rating: details.rating != null ? String(details.rating) : null,
      userRatingsTotal: details.userRatingsTotal,
      // Shapes are structurally identical to the persisted review record.
      reviews: details.reviews,
      status: 'connected',
      lastFetchedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.googlePlaceCache.profileId, profileId));
}

/** Record a fetch failure without discarding the previous (still-fresh) payload. */
export async function persistError(profileId: string, message: string): Promise<void> {
  await db
    .update(schema.googlePlaceCache)
    .set({ status: 'error', lastError: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(schema.googlePlaceCache.profileId, profileId));
}

/**
 * Profiles due for a refresh: not `stale`, and either never fetched or last
 * fetched before `cutoff`. Bounded by `limit` so one sweep tick can't fan out
 * unboundedly.
 */
export async function findDueForRefresh(cutoff: Date, limit: number): Promise<string[]> {
  const rows = await db
    .select({ profileId: schema.googlePlaceCache.profileId })
    .from(schema.googlePlaceCache)
    .where(
      and(
        inArray(schema.googlePlaceCache.status, ['pending', 'connected', 'error']),
        or(
          isNull(schema.googlePlaceCache.lastFetchedAt),
          lt(schema.googlePlaceCache.lastFetchedAt, cutoff),
        ),
      ),
    )
    .limit(limit);
  return rows.map((r) => r.profileId);
}

/**
 * ToS safety net: purge review content for rows last fetched before `tosCutoff`
 * (the 30-day window). Keeps `placeId`; clears reviews/rating and marks `stale`.
 * Returns the number of rows purged.
 */
export async function purgeExpired(tosCutoff: Date): Promise<number> {
  const purged = await db
    .update(schema.googlePlaceCache)
    .set({
      reviews: [],
      rating: null,
      status: 'stale',
      lastError: 'Cached Google content expired (30-day ToS window)',
      updatedAt: new Date(),
    })
    .where(
      and(
        ne(schema.googlePlaceCache.status, 'stale'),
        lt(schema.googlePlaceCache.lastFetchedAt, tosCutoff),
      ),
    )
    .returning({ profileId: schema.googlePlaceCache.profileId });
  return purged.length;
}
