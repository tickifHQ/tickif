import { config } from '@repo/config';

/**
 * Thin wrapper over the Google Places API (New) — Text Search + Place Details,
 * used to fetch a designer's Google rating and recent reviews for their portfolio.
 *
 * Uses the v1 `places.googleapis.com` endpoints (the legacy `maps/api/place`
 * API is closed to new GCP projects). Auth is via the `X-Goog-Api-Key` header
 * and every request declares an `X-Goog-FieldMask` (required by the New API).
 *
 * ToS note: `place_id` may be stored indefinitely, but review content
 * (text/author/photo) must not be cached longer than 30 days. The caller is
 * responsible for honouring that — see the worker sweep + read-time guard.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1';
const REQUEST_TIMEOUT_MS = 10_000;
/** Place Details (New) returns at most 5 reviews; we never keep more. */
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

/** Map an HTTP status (New API uses standard codes) onto our error taxonomy. */
function httpStatusToError(status: number, message: string): GooglePlacesError {
  const detail = message ? `: ${message}` : '';
  switch (status) {
    case 400:
      return new GooglePlacesError('invalid_input', `Invalid Places request${detail}`);
    case 403:
      return new GooglePlacesError('request_denied', `Places request denied${detail}`);
    case 404:
      return new GooglePlacesError('not_found', `Place not found${detail}`);
    case 429:
      return new GooglePlacesError('rate_limited', `Places quota exceeded${detail}`);
    default:
      // 5xx (and anything else) is treated as transient/unknown upstream failure.
      return new GooglePlacesError(
        status >= 500 ? 'network' : 'unknown',
        `Places error ${status}${detail}`,
      );
  }
}

/** Issue a Places API (New) request with the field mask and typed error handling. */
async function placesRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  fieldMask: string,
  body?: unknown,
): Promise<T> {
  const apiKey = requireApiKey();
  const headers: Record<string, string> = {
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${PLACES_BASE}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new GooglePlacesError('network', `Places request failed: ${(err as Error).message}`);
  }

  if (!response.ok) {
    // New API returns { error: { code, status, message } } on failure.
    const errBody = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw httpStatusToError(response.status, errBody?.error?.message ?? '');
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new GooglePlacesError('network', 'Places returned an unreadable response body');
  }
}

// A Google Maps place-id always begins with this prefix; used to short-circuit resolution.
const PLACE_ID_RE = /^ChI[A-Za-z0-9_-]+$/;

const GOOGLE_LINK_HOSTS = new Set([
  'share.google',
  'maps.app.goo.gl',
  'www.google.com',
  'google.com',
  'maps.google.com',
]);

/** Resolve only Google's known link hosts; never forward the API key or follow arbitrary redirects. */
async function resolveGoogleLink(input: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (!GOOGLE_LINK_HOSTS.has(url.hostname)) return input;
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const visited = new Set<string>();
  for (let hop = 0; hop <= 5; hop += 1) {
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !GOOGLE_LINK_HOSTS.has(url.hostname) ||
      visited.has(url.href)
    ) {
      throw new GooglePlacesError('invalid_input', 'Unsupported Google Business redirect');
    }
    const placeId = extractPlaceIdFromUrl(url.href);
    if (placeId) return placeId;
    if (url.pathname === '/search' || url.pathname.startsWith('/maps')) {
      const query = url.searchParams.get('q') ?? url.searchParams.get('query');
      if (query?.trim()) return query.trim();
      const placeName = url.pathname.match(/^\/maps\/place\/([^/]+)/)?.[1];
      if (placeName) {
        try {
          return decodeURIComponent(placeName.replace(/\+/g, ' '));
        } catch {
          throw new GooglePlacesError('invalid_input', 'Invalid Google Maps place name');
        }
      }
    }
    const shortLink =
      url.hostname === 'share.google' ||
      url.hostname === 'maps.app.goo.gl' ||
      url.pathname === '/share.google';
    if (!shortLink || hop === 5) {
      throw new GooglePlacesError(
        'invalid_input',
        'Use a Google Business place link or business name',
      );
    }
    visited.add(url.href);
    let response: Response;
    try {
      // Google's share endpoint returns 200 for HEAD without its GET redirect.
      response = await fetch(url.href, { method: 'GET', redirect: 'manual', signal });
      await response.body?.cancel();
    } catch {
      throw new GooglePlacesError('network', 'Could not resolve the Google Business link');
    }
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) {
      throw new GooglePlacesError(
        'invalid_input',
        'Google Business link did not resolve to a place',
      );
    }
    try {
      url = new URL(location, url);
    } catch {
      throw new GooglePlacesError('invalid_input', 'Invalid Google Business redirect');
    }
  }
  throw new GooglePlacesError('invalid_input', 'Too many Google Business redirects');
}

/**
 * Resolve a designer-supplied Google Business URL (or raw place-id / free text)
 * to a canonical `place_id`.
 *
 * - A value that already looks like a place-id is returned as-is.
 * - A maps URL carrying `?place_id=...` or a `!1s<place_id>` data segment is
 *   parsed directly (no API call).
 * - Google share/Maps short links are resolved through bounded, allowlisted redirects.
 * - A Maps/Search business name or free text is sent to Text Search (New).
 */
export async function resolvePlaceId(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new GooglePlacesError('invalid_input', 'Empty Google Business reference');

  if (PLACE_ID_RE.test(trimmed)) return trimmed;

  // Try to extract a place-id embedded in a maps URL without spending a quota call.
  const embedded = extractPlaceIdFromUrl(trimmed);
  if (embedded) return embedded;

  const reference = await resolveGoogleLink(trimmed);
  if (PLACE_ID_RE.test(reference)) return reference;

  const body = await placesRequest<{ places?: Array<{ id: string }> }>(
    'POST',
    'places:searchText',
    'places.id',
    { textQuery: reference, maxResultCount: 1 },
  );
  const placeId = body.places?.[0]?.id;
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
  const qp = url.searchParams.get('place_id') ?? url.searchParams.get('query_place_id');
  if (qp && PLACE_ID_RE.test(qp)) return qp;
  const dataMatch = url.pathname.match(/!1s(ChI[A-Za-z0-9_-]+)/);
  if (dataMatch) return dataMatch[1] ?? null;
  return null;
}

type NewReview = {
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  publishTime?: string;
};

/** ISO-8601 publish time → unix seconds (0 when absent/unparseable). */
function toUnixSeconds(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** Fetch the aggregate rating + up to 5 recent reviews for a place. */
export async function fetchPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
  const result = await placesRequest<{
    id?: string;
    displayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    reviews?: NewReview[];
  }>(
    'GET',
    `places/${encodeURIComponent(placeId)}`,
    'id,displayName,rating,userRatingCount,googleMapsUri,reviews',
  );

  const reviews: GooglePlaceReview[] = (result.reviews ?? [])
    .slice(0, MAX_GOOGLE_REVIEWS)
    .map((r) => ({
      author: r.authorAttribution?.displayName ?? 'Google user',
      authorUrl: r.authorAttribution?.uri ?? null,
      profilePhotoUrl: r.authorAttribution?.photoUri ?? null,
      rating: typeof r.rating === 'number' ? r.rating : 0,
      relativeTime: r.relativePublishTimeDescription ?? '',
      text: r.text?.text ?? r.originalText?.text ?? '',
      time: toUnixSeconds(r.publishTime),
    }));

  return {
    placeId,
    name: result.displayName?.text ?? null,
    rating: typeof result.rating === 'number' ? result.rating : null,
    userRatingsTotal: typeof result.userRatingCount === 'number' ? result.userRatingCount : null,
    url: result.googleMapsUri ?? null,
    reviews,
  };
}
