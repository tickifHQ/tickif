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
    await enqueueGoogleReviewsRefresh({ profileId: profile.id });
    return buildResponse(row);
  },

  /** Disconnect: drop the cache row entirely. */
  async disconnect(caller: Caller): Promise<void> {
    const profile = await resolveProfile(caller);
    await googleReviewsRepository.delete(profile.id);
  },
};
