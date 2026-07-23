import { config } from '@repo/config';
import { fetchPlaceDetails, GooglePlacesError } from '@repo/google-places';
import { enqueueGoogleReviewsRefresh } from '@repo/queue';
import {
  findDueForRefresh,
  getPlaceId,
  persistError,
  persistResult,
  purgeExpired,
} from '../google-reviews/repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Google forbids caching review content beyond 30 days. */
const TOS_MAX_AGE_MS = 30 * DAY_MS;
/** Cap the fan-out of one sweep tick. */
const SWEEP_REFRESH_LIMIT = 100;

/**
 * Refresh one designer's Google reviews: fetch Place Details and persist.
 * Transient failures (network/rate-limit) rethrow so BullMQ retries;
 * terminal failures (not-found/denied) park the row in `error` without retry.
 */
export async function processGoogleReviewRefresh(profileId: string): Promise<void> {
  const placeId = await getPlaceId(profileId);
  // Disconnected between enqueue and run — nothing to do.
  if (!placeId) return;

  try {
    const details = await fetchPlaceDetails(placeId);
    await persistResult(profileId, details);
  } catch (err) {
    if (err instanceof GooglePlacesError) {
      await persistError(profileId, err.message);
      if (err.code === 'network' || err.code === 'rate_limited') throw err;
      return;
    }
    throw err;
  }
}

/**
 * Periodic sweep: purge ToS-expired payloads, then enqueue refreshes for rows
 * older than the configured refresh window. Returns counts for logging.
 */
export async function processGoogleReviewSweep(): Promise<{ purged: number; enqueued: number }> {
  const now = Date.now();
  const purged = await purgeExpired(new Date(now - TOS_MAX_AGE_MS));
  const cutoff = new Date(now - config.GOOGLE_PLACES_REFRESH_DAYS * DAY_MS);
  const due = await findDueForRefresh(cutoff, SWEEP_REFRESH_LIMIT);
  for (const profileId of due) {
    await enqueueGoogleReviewsRefresh({ profileId });
  }
  return { purged, enqueued: due.length };
}
