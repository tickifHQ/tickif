import type { GoogleConnectionSummary, GoogleReview } from '@repo/contracts';
import type { GooglePlaceCacheRecord } from './google-repository.js';

/**
 * Google's Places ToS forbids serving cached review content older than 30 days.
 * Beyond this age we downgrade the row to `stale` at read time and withhold the
 * payload — a belt-and-suspenders guard in case the worker sweep lagged.
 */
export const TOS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Derive the API-facing connection summary + reviews from a cache row, applying
 * the read-time ToS guard. Pure — no DB or network. Shared by the portfolio
 * response builder and the Google reviews service (avoids a service cycle).
 */
export function readState(row: GooglePlaceCacheRecord): {
  summary: GoogleConnectionSummary;
  reviews: GoogleReview[];
} {
  const expired =
    row.lastFetchedAt != null && Date.now() - row.lastFetchedAt.getTime() >= TOS_MAX_AGE_MS;
  const status = expired ? 'stale' : row.status;
  // Only a fresh, successfully-connected row serves rating + review content.
  const serve = status === 'connected';

  const summary: GoogleConnectionSummary = {
    status,
    placeId: row.placeId,
    rating: serve && row.rating != null ? Number(row.rating) : null,
    userRatingsTotal: serve ? row.userRatingsTotal : null,
    lastFetchedAt: row.lastFetchedAt ? row.lastFetchedAt.toISOString() : null,
  };

  // Stored records already match the GoogleReview contract shape 1:1.
  const reviews: GoogleReview[] = serve ? row.reviews.map((r) => ({ ...r })) : [];
  return { summary, reviews };
}
