import type {
  GoogleReviewsResponse,
  PortfolioProjectsResponse,
  PortfolioResponse,
  SlugAvailabilityResponse,
  UpdatePortfolioInput,
  UploadLogoResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';

/**
 * Portfolio API client — typed wrappers around the Hono RPC client.
 *
 * Each function calls the correct endpoint, checks for errors, and returns
 * typed data. These are plain async functions (not React hooks) so they can
 * be called from server components, client transitions, or event handlers.
 */

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a user-friendly message from the standard Tickif error
 * envelope: `{ error: { code, message, details? } }`.
 *
 * For validation errors (422) the envelope's `message` is a generic
 * "Request validation failed" — the actionable per-field messages live in
 * `details`, so surface those instead when present.
 */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object' &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  ) {
    const detailMessage = extractDetailMessage(body.error);
    return detailMessage ?? body.error.message;
  }
  return fallback;
}

/**
 * Format the first few `details` entries (`{ path, message }` from the API's
 * validation hook) into a single human-readable message, or null if absent.
 */
function extractDetailMessage(error: object): string | null {
  if (!('details' in error) || !Array.isArray(error.details)) return null;
  const messages = error.details
    .filter(
      (d): d is { path?: unknown; message: string } =>
        !!d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string',
    )
    .slice(0, 3)
    .map((d) => (typeof d.path === 'string' && d.path ? `${d.path}: ${d.message}` : d.message));
  return messages.length > 0 ? messages.join('; ') : null;
}

/**
 * Shared response handler: checks `response.ok`, parses JSON, and throws a
 * descriptive error on failure.
 */
async function handleResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body (e.g. an HTML gateway error page) — fall back to
      // the generic message instead of leaking a JSON parse error.
    }
    throw new Error(extractErrorMessage(body, fallbackMessage));
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Portfolio CRUD
// ---------------------------------------------------------------------------

/** GET /api/profiles/me/portfolio — retrieve merged portfolio + profile data. */
export async function fetchPortfolio(): Promise<PortfolioResponse> {
  const response = await api.api.profiles.me.portfolio.$get();
  return handleResponse<PortfolioResponse>(response, 'Could not load portfolio settings.');
}

/** PATCH /api/profiles/me/portfolio — partial update of portfolio settings. */
export async function updatePortfolio(input: UpdatePortfolioInput): Promise<PortfolioResponse> {
  const response = await api.api.profiles.me.portfolio.$patch({
    json: input,
  });
  return handleResponse<PortfolioResponse>(response, 'Could not save portfolio settings.');
}

/** GET /api/projects/portfolio — published projects available for portfolio sections. */
export async function fetchPortfolioProjects(): Promise<PortfolioProjectsResponse> {
  const response = await api.api.projects.portfolio.$get({
    query: { status: 'published', page: 1, limit: 50, sort: 'title' },
  });
  return handleResponse<PortfolioProjectsResponse>(response, 'Could not load portfolio projects.');
}

// ---------------------------------------------------------------------------
// Slug availability
// ---------------------------------------------------------------------------

/** POST /api/profiles/me/portfolio/slug-check — check if a slug is available. */
export async function checkSlugAvailability(slug: string): Promise<SlugAvailabilityResponse> {
  const response = await api.api.profiles.me.portfolio['slug-check'].$post({
    json: { slug },
  });
  return handleResponse<SlugAvailabilityResponse>(response, 'Could not check slug availability.');
}

// ---------------------------------------------------------------------------
// Logo upload flow (presign → PUT → commit)
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full logo upload:
 * 1. Request a presigned upload URL from the API
 * 2. PUT the file directly to the presigned URL (R2 / S3)
 * 3. Commit the upload so the API persists the association
 */
export async function uploadLogo(file: File): Promise<UploadLogoResponse> {
  // Step 1: Get presigned upload URL
  const presignResponse = await api.api.profiles.me.portfolio.logo.upload.$post({
    json: {
      contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif',
      contentLength: file.size,
    },
  });

  const { uploadUrl, key } = await handleResponse<{ uploadUrl: string; key: string }>(
    presignResponse,
    'Could not prepare logo upload.',
  );

  // Step 2: Upload the file directly to storage via presigned URL
  const storageResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!storageResponse.ok) {
    throw new Error('Could not upload logo to storage.');
  }

  // Step 3: Commit the upload
  const commitResponse = await api.api.profiles.me.portfolio.logo.commit.$post({
    json: { objectKey: key },
  });

  return handleResponse<UploadLogoResponse>(commitResponse, 'Could not commit logo upload.');
}

// ---------------------------------------------------------------------------
// Logo delete
// ---------------------------------------------------------------------------

/** DELETE /api/profiles/me/portfolio/logo — remove the portfolio logo. */
export async function deleteLogo(): Promise<void> {
  const response = await api.api.profiles.me.portfolio.logo.$delete();
  if (!response.ok) {
    // 204 has no body; only parse JSON for error responses
    let message = 'Could not delete logo.';
    try {
      const body: unknown = await response.json();
      message = extractErrorMessage(body, message);
    } catch {
      // response may have no body (e.g. network error shapes)
    }
    throw new Error(message);
  }
}

// ---------------------------------------------------------------------------
// Google reviews
// ---------------------------------------------------------------------------

/** GET /api/profiles/me/portfolio/google — connection state + cached reviews. */
export async function fetchGoogleReviews(): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.$get();
  return handleResponse<GoogleReviewsResponse>(response, 'Could not load Google reviews.');
}

/** POST /api/profiles/me/portfolio/google/connect — link a Google Business location. */
export async function connectGoogleReviews(reference: string): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.connect.$post({
    json: { reference },
  });
  return handleResponse<GoogleReviewsResponse>(response, 'Could not connect that Google location.');
}

/** POST /api/profiles/me/portfolio/google/refresh — re-fetch in the background. */
export async function refreshGoogleReviews(): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.refresh.$post();
  return handleResponse<GoogleReviewsResponse>(response, 'Could not refresh Google reviews.');
}

/** DELETE /api/profiles/me/portfolio/google — disconnect the location. */
export async function disconnectGoogleReviews(): Promise<void> {
  const response = await api.api.profiles.me.portfolio.google.$delete();
  if (!response.ok) {
    let message = 'Could not disconnect Google reviews.';
    try {
      const body: unknown = await response.json();
      message = extractErrorMessage(body, message);
    } catch {
      // response may have no body
    }
    throw new Error(message);
  }
}
