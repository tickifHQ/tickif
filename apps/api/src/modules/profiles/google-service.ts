import {
  GooglePlacesError,
  isGooglePlacesConfigured,
  resolvePlaceId,
} from '@repo/google-places';
import { enqueueGoogleReviewsRefresh } from '@repo/queue';
import type { ConnectGooglePlaceInput, GoogleReviewsResponse } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { resolveProfile, type Caller } from './portfolio-service.js';
import { googleReviewsRepository, type GooglePlaceCacheRecord } from './google-repository.js';
import { readState } from './google-mapper.js';

/**
 * Google review connection logic for the designer portfolio.
 *
 * Split of responsibilities: the API validates + resolves the place-id and
 * enqueues work; the *worker* performs the Places `Place Details` fetch and
 * persists review content. This keeps a single fetch-and-persist implementation
 * (in the worker) and keeps request latency off the third-party API.
 */

/** Map a Places client error onto the right HTTP error for the connect flow. */
function toAppError(err: unknown): AppError {
  if (err instanceof GooglePlacesError) {
    switch (err.code) {
      case 'not_found':
        return AppError.unprocessable('No Google location matched that reference');
      case 'invalid_input':
        return AppError.badRequest('That does not look like a valid Google Business reference');
      case 'rate_limited':
        return AppError.conflict('Google is rate-limiting requests; try again shortly');
      case 'not_configured':
        return AppError.unprocessable('Google review fetching is not available');
      default:
        return AppError.badRequest('Could not reach Google to verify that location');
    }
  }
  throw err;
}

function buildResponse(row: GooglePlaceCacheRecord | null): GoogleReviewsResponse {
  const available = isGooglePlacesConfigured();
  if (!row) return { available, connection: null, reviews: [] };
  const { summary, reviews } = readState(row);
  return { available, connection: summary, reviews };
}

/**
 * Minimum gap between a designer's own connect/refresh actions. Each triggers a
 * billable Google Places call on the shared platform key, so a per-profile
 * cooldown stops one account from looping them to exhaust the quota (a cheap
 * cost-DoS that would also degrade every other tenant). Legitimate use — connect
 * once, refresh occasionally — never hits this.
 */
const ATTEMPT_COOLDOWN_MS = 10_000;

function assertNotThrottled(row: GooglePlaceCacheRecord | null): void {
  if (!row?.lastAttemptAt) return;
  const elapsed = Date.now() - new Date(row.lastAttemptAt).getTime();
  if (elapsed < ATTEMPT_COOLDOWN_MS) {
    throw AppError.tooManyRequests(
      'You just updated this Google connection — wait a few seconds and try again.',
    );
  }
}

export const googleReviewsService = {
  /** Owner view of the connection + cached reviews. */
  async get(caller: Caller): Promise<GoogleReviewsResponse> {
    const profile = await resolveProfile(caller);
    const row = await googleReviewsRepository.findByProfileId(profile.id);
    return buildResponse(row);
  },

  /**
   * Link a Google Business location. Resolves the reference to a stable place-id
   * (synchronously, so the designer gets immediate "invalid location" feedback),
   * stores it `pending`, and enqueues the first background fetch.
   */
  async connect(input: ConnectGooglePlaceInput, caller: Caller): Promise<GoogleReviewsResponse> {
    if (!isGooglePlacesConfigured()) {
      throw AppError.unprocessable('Google review fetching is not available');
    }
    const profile = await resolveProfile(caller);

    // Per-profile rate limit on the billable resolve. The first connect (no row
    // yet) is allowed; every later attempt is gated and the clock is stamped
    // *before* the outbound call so a failing reference can't be looped for free.
    const existing = await googleReviewsRepository.findByProfileId(profile.id);
    if (existing) {
      assertNotThrottled(existing);
      await googleReviewsRepository.touchAttempt(profile.id);
    }

    let placeId: string;
    try {
      placeId = await resolvePlaceId(input.reference);
    } catch (err) {
      throw toAppError(err);
    }

    const row = await googleReviewsRepository.upsert(profile.id, {
      placeId,
      status: 'pending',
      rating: null,
      userRatingsTotal: null,
      reviews: [],
      lastFetchedAt: null,
      lastAttemptAt: new Date(),
      lastError: null,
    });
    await enqueueGoogleReviewsRefresh({ profileId: profile.id });
    return buildResponse(row);
  },

  /**
   * Manually re-fetch. Enqueues a background refresh and returns the current
   * cached state (202-style); the UI re-reads after a short delay.
   */
  async refresh(caller: Caller): Promise<GoogleReviewsResponse> {
    if (!isGooglePlacesConfigured()) {
      throw AppError.unprocessable('Google review fetching is not available');
    }
    const profile = await resolveProfile(caller);
    const row = await googleReviewsRepository.findByProfileId(profile.id);
    if (!row) throw AppError.notFound('No Google location is connected');
    assertNotThrottled(row);
    await googleReviewsRepository.touchAttempt(profile.id);
    await enqueueGoogleReviewsRefresh({ profileId: profile.id });
    return buildResponse(row);
  },

  /** Disconnect: drop the cache row entirely. */
  async disconnect(caller: Caller): Promise<void> {
    const profile = await resolveProfile(caller);
    await googleReviewsRepository.delete(profile.id);
  },
};
