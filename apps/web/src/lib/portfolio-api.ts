import {
  googleReviewsResponseSchema,
  listProjectsResponseSchema,
  logoUploadUrlResponseSchema,
  portfolioProjectsResponseSchema,
  portfolioResponseSchema,
  slugAvailabilityResponseSchema,
  uploadLogoResponseSchema,
  type GoogleReviewsResponse,
  type PortfolioProjectsResponse,
  type PortfolioResponse,
  type SlugAvailabilityResponse,
  type UpdatePortfolioInput,
  type UploadLogoResponse,
} from '@repo/contracts';
import { api } from '@/lib/api';
import {
  handleApiResponse,
  readApiErrorMessage,
} from '@/lib/api-response';

/**
 * Portfolio API client — typed wrappers around the Hono RPC client.
 *
 * Each function calls the correct endpoint, checks for errors, and returns
 * typed data. These are plain async functions (not React hooks) so they can
 * be called from server components, client transitions, or event handlers.
 */

// ---------------------------------------------------------------------------
// Portfolio CRUD
// ---------------------------------------------------------------------------

/** GET /api/profiles/me/portfolio — retrieve merged portfolio + profile data. */
export async function fetchPortfolio(): Promise<PortfolioResponse> {
  const response = await api.api.profiles.me.portfolio.$get();
  return handleApiResponse(response, portfolioResponseSchema, 'Could not load portfolio settings.');
}

/** PATCH /api/profiles/me/portfolio — partial update of portfolio settings. */
export async function updatePortfolio(input: UpdatePortfolioInput): Promise<PortfolioResponse> {
  const response = await api.api.profiles.me.portfolio.$patch({
    json: input,
  });
  return handleApiResponse(response, portfolioResponseSchema, 'Could not save portfolio settings.');
}

/** GET /api/projects/portfolio — published projects available for portfolio sections. */
export async function fetchPortfolioProjects(): Promise<PortfolioProjectsResponse> {
  const response = await api.api.projects.portfolio.$get({
    query: { status: 'published', page: 1, limit: 50, sort: 'title' },
  });
  return handleApiResponse(
    response,
    portfolioProjectsResponseSchema,
    'Could not load portfolio projects.',
  );
}

// ---------------------------------------------------------------------------
// Slug availability
// ---------------------------------------------------------------------------

/** POST /api/profiles/me/portfolio/slug-check — check if a slug is available. */
export async function checkSlugAvailability(slug: string): Promise<SlugAvailabilityResponse> {
  const response = await api.api.profiles.me.portfolio['slug-check'].$post({
    json: { slug },
  });
  return handleApiResponse(
    response,
    slugAvailabilityResponseSchema,
    'Could not check slug availability.',
  );
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

  const { uploadUrl, key } = await handleApiResponse(
    presignResponse,
    logoUploadUrlResponseSchema,
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

  return handleApiResponse(commitResponse, uploadLogoResponseSchema, 'Could not commit logo upload.');
}

// ---------------------------------------------------------------------------
// Logo delete
// ---------------------------------------------------------------------------

/** DELETE /api/profiles/me/portfolio/logo — remove the portfolio logo. */
export async function deleteLogo(): Promise<void> {
  const response = await api.api.profiles.me.portfolio.logo.$delete();
  if (!response.ok) {
    // 204 has no body; only parse JSON for error responses
    throw new Error(await readApiErrorMessage(response, 'Could not delete logo.'));
  }
}

// ---------------------------------------------------------------------------
// Google reviews
// ---------------------------------------------------------------------------

/** GET /api/profiles/me/portfolio/google — connection state + cached reviews. */
export async function fetchGoogleReviews(): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.$get();
  return handleApiResponse(response, googleReviewsResponseSchema, 'Could not load Google reviews.');
}

/** POST /api/profiles/me/portfolio/google/connect — link a Google Business location. */
export async function connectGoogleReviews(reference: string): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.connect.$post({
    json: { reference },
  });
  return handleApiResponse(
    response,
    googleReviewsResponseSchema,
    'Could not connect that Google location.',
  );
}

/** POST /api/profiles/me/portfolio/google/refresh — re-fetch in the background. */
export async function refreshGoogleReviews(): Promise<GoogleReviewsResponse> {
  const response = await api.api.profiles.me.portfolio.google.refresh.$post();
  return handleApiResponse(response, googleReviewsResponseSchema, 'Could not refresh Google reviews.');
}

/** DELETE /api/profiles/me/portfolio/google — disconnect the location. */
export async function disconnectGoogleReviews(): Promise<void> {
  const response = await api.api.profiles.me.portfolio.google.$delete();
  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, 'Could not disconnect Google reviews.'));
  }
}

// ---------------------------------------------------------------------------
// Projects (for testimonial picker)
// ---------------------------------------------------------------------------

/** Lightweight project info for the testimonial project picker. */
export type TestimonialProjectOption = {
  id: string;
  title: string;
};

/**
 * GET /api/projects — fetch the designer's published projects for the
 * testimonial picker. Returns only the fields needed for selection.
 */
export async function fetchPublishedProjects(): Promise<TestimonialProjectOption[]> {
  const response = await api.api.projects.$get({
    query: { status: 'published', limit: 100 },
  });
  const data = await handleApiResponse(
    response,
    listProjectsResponseSchema,
    'Could not load projects.',
  );
  return data.items.map((p) => ({ id: p.id, title: p.title }));
}
