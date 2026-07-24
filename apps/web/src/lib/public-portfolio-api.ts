import type { DesignerProjectsResponse, PublicPortfolioResponse } from '@repo/contracts';
import { api } from '@/lib/api';

/**
 * Public portfolio API client — anonymous reads for the `/d/{slug}` page.
 *
 * Separate from `portfolio-api.ts`, which wraps the authenticated designer
 * settings endpoints. Nothing here needs a session.
 */

/**
 * GET /api/portfolios/{slug} — the whole public page payload.
 *
 * Returns null for 404 so the page can call `notFound()` without treating a
 * missing portfolio as an error. Other failures throw, so a broken API surfaces
 * as a 500 rather than silently rendering an empty page.
 */
export async function fetchPublicPortfolio(
  slug: string,
): Promise<PublicPortfolioResponse | null> {
  const response = await api.api.portfolios[':slug'].$get({ param: { slug } });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load the portfolio at /d/${slug} (HTTP ${response.status}).`);
  }
  return (await response.json()) as PublicPortfolioResponse;
}

/**
 * GET /api/profiles/{id}/projects — a further page of published projects.
 *
 * The initial page ships inside the portfolio payload; the gallery calls this
 * when the visitor asks for more.
 */
export async function fetchDesignerProjects(
  profileId: string,
  params: { page: number; limit: number },
): Promise<DesignerProjectsResponse> {
  const response = await api.api.profiles[':id'].projects.$get({
    param: { id: profileId },
    query: { page: String(params.page), limit: String(params.limit) },
  });

  if (!response.ok) {
    throw new Error('Could not load more projects.');
  }
  return (await response.json()) as DesignerProjectsResponse;
}
