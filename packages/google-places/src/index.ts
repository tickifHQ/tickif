import { config } from '@repo/config';

/**
 * Thin wrapper over the Google Places API (legacy Place Details + Find Place),
 * used to fetch a designer's Google rating and recent reviews for their portfolio.
 *
 * ToS note: `place_id` may be stored indefinitely, but review content
 * (text/author/photo) must not be cached longer than 30 days. The caller is
 * responsible for honouring that — see the worker sweep + read-time guard.
 */

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const REQUEST_TIMEOUT_MS = 10_000;
/** Google's Place Details returns at most 5 reviews; we never keep more. */
export const MAX_GOOGLE_REVIEWS = 5;

/** A single Google review as surfaced to the portfolio. */
export type GooglePlaceReview = {
  author: string;
  authorUrl: string | null;
  profilePhotoUrl: string | null;
  rating: number;
  relativeTime: string;
  text: string;
  /** Unix seconds when the review was written. */
  time: number;
};

/** Aggregate + reviews for one place. */
export type GooglePlaceDetails = {
  placeId: string;
  name: string | null;
  /** 1.0–5.0, or null when the place has no ratings yet. */
  rating: number | null;
  userRatingsTotal: number | null;
  /** Public Google Maps URL for the place. */
  url: string | null;
  reviews: GooglePlaceReview[];
};

/** Raised for any non-OK Places response so callers can branch on `code`. */
export class GooglePlacesError extends Error {
  constructor(
    public readonly code:
      | 'not_configured'
      | 'not_found'
      | 'invalid_input'
      | 'rate_limited'
      | 'request_denied'
      | 'network'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'GooglePlacesError';
  }
}

/** True when a Places API key is present — the feature is disabled otherwise. */
export function isGooglePlacesConfigured(): boolean {
  return Boolean(config.GOOGLE_PLACES_API_KEY);
}

/** Fail-fast guard for entry points that require the API (worker/connect flow). */
export function assertGooglePlacesConfig(): void {
  requireApiKey();
}

/** Return the API key or throw a typed `not_configured` error. */
function requireApiKey(): string {
  if (!config.GOOGLE_PLACES_API_KEY) {
    throw new GooglePlacesError(
      'not_configured',
      'GOOGLE_PLACES_API_KEY is not set; Google review fetching is disabled',
    );
  }
  return config.GOOGLE_PLACES_API_KEY;
}

/** Map a Google `status` string onto our error taxonomy. */
function statusToError(status: string, errorMessage?: string): GooglePlacesError {
  const detail = errorMessage ? `: ${errorMessage}` : '';
  switch (status) {
    case 'ZERO_RESULTS':
    case 'NOT_FOUND':
      return new GooglePlacesError('not_found', `Place not found${detail}`);
    case 'INVALID_REQUEST':
      return new GooglePlacesError('invalid_input', `Invalid Places request${detail}`);
    case 'OVER_QUERY_LIMIT':
      return new GooglePlacesError('rate_limited', `Places quota exceeded${detail}`);
    case 'REQUEST_DENIED':
      return new GooglePlacesError('request_denied', `Places request denied${detail}`);
    default:
      return new GooglePlacesError('unknown', `Places error ${status}${detail}`);
  }
}

async function placesGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = requireApiKey();
  const url = new URL(`${PLACES_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('key', apiKey);

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new GooglePlacesError('network', `Places request failed: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new GooglePlacesError('network', `Places request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { status: string; error_message?: string } & T;
  // Places encodes success/failure in the JSON `status`, not the HTTP status.
  if (body.status !== 'OK') throw statusToError(body.status, body.error_message);
  return body;
}

// A Google Maps place-id always begins with this prefix; used to short-circuit resolution.
const PLACE_ID_RE = /^ChI[A-Za-z0-9_-]+$/;

/**
 * Resolve a designer-supplied Google Business URL (or raw place-id / free text)
 * to a canonical `place_id`.
 *
 * - A value that already looks like a place-id is returned as-is.
 * - A maps URL carrying `?place_id=...` or a `!1s<place_id>` data segment is
 *   parsed directly (no API call).
 * - Anything else is sent to Find Place From Text.
 */
export async function resolvePlaceId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new GooglePlacesError('invalid_input', 'Empty Google Business reference');

  if (PLACE_ID_RE.test(trimmed)) return trimmed;

  // Try to extract a place-id embedded in a maps URL without spending a quota call.
  const embedded = extractPlaceIdFromUrl(trimmed);
  if (embedded) return embedded;

  const body = await placesGet<{ candidates: Array<{ place_id: string }> }>(
    'findplacefromtext/json',
    { input: trimmed, inputtype: 'textquery', fields: 'place_id' },
  );
  const placeId = body.candidates?.[0]?.place_id;
  if (!placeId) throw new GooglePlacesError('not_found', 'No place matched the given reference');
  return placeId;
}

/** Pull a place-id out of the query string or `!1s...` data segment of a maps URL. */
export function extractPlaceIdFromUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const qp = url.searchParams.get('place_id');
  if (qp && PLACE_ID_RE.test(qp)) return qp;
  const dataMatch = url.pathname.match(/!1s(ChI[A-Za-z0-9_-]+)/);
  if (dataMatch) return dataMatch[1] ?? null;
  return null;
}

type RawReview = {
  author_name?: string;
  author_url?: string;
  profile_photo_url?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  time?: number;
};

/** Fetch the aggregate rating + up to 5 recent reviews for a place. */
export async function fetchPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
  const body = await placesGet<{
    result: {
      name?: string;
      rating?: number;
      user_ratings_total?: number;
      url?: string;
      reviews?: RawReview[];
    };
  }>('details/json', {
    place_id: placeId,
    fields: 'name,rating,user_ratings_total,url,reviews',
    reviews_sort: 'newest',
  });

  const result = body.result ?? {};
  const reviews: GooglePlaceReview[] = (result.reviews ?? [])
    .slice(0, MAX_GOOGLE_REVIEWS)
    .map((r) => ({
      author: r.author_name ?? 'Google user',
      authorUrl: r.author_url ?? null,
      profilePhotoUrl: r.profile_photo_url ?? null,
      rating: typeof r.rating === 'number' ? r.rating : 0,
      relativeTime: r.relative_time_description ?? '',
      text: r.text ?? '',
      time: typeof r.time === 'number' ? r.time : 0,
    }));

  return {
    placeId,
    name: result.name ?? null,
    rating: typeof result.rating === 'number' ? result.rating : null,
    userRatingsTotal: typeof result.user_ratings_total === 'number' ? result.user_ratings_total : null,
    url: result.url ?? null,
    reviews,
  };
}
