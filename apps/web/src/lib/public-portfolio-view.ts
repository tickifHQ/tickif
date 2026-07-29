import type { DesignerProjectCard, PublicPortfolioResponse } from '@repo/contracts';

/**
 * Display helpers for the public designer portfolio.
 *
 * The API returns data; these turn it into the strings the page renders. Kept
 * pure and separate from the components so the fallback rules are testable —
 * most of them exist because a designer can leave any single field blank.
 */

/**
 * Up to two initials for the avatar monogram, e.g. "Anika Spaces" → "AS".
 * Falls back to the first two characters for single-word names.
 */
export function studioInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

/**
 * The "Interior Design Studio" line. `firmType` is designer-entered free text;
 * when blank, fall back to a label implied by the entity type.
 */
export function studioType(
  portfolio: Pick<PublicPortfolioResponse, 'firmType' | 'entityType'>,
): string {
  if (portfolio.firmType?.trim()) return portfolio.firmType.trim();
  return portfolio.entityType === 'company' ? 'Design Studio' : 'Interior Designer';
}

/**
 * Where the studio works: its primary city, plus a count when it covers more.
 *
 * Prefers the city footprint (the designer's declared coverage) and falls back
 * to the city of their most recent published project. The street address is
 * deliberately unavailable here — the API keeps it private.
 */
export function studioLocation(
  portfolio: Pick<PublicPortfolioResponse, 'cities'>,
  projects: DesignerProjectCard[],
): string | null {
  const primary = portfolio.cities[0] ?? projects.find((p) => p.city)?.city ?? null;
  if (!primary) return null;
  return portfolio.cities.length > 1 ? `${primary} · ${portfolio.cities.length} cities` : primary;
}

/** The one-line hero pitch: the curated tagline, else the opening of the bio. */
export function strapline(
  portfolio: Pick<PublicPortfolioResponse, 'tagline' | 'bio'>,
): string | null {
  return portfolio.tagline?.trim() || portfolio.bio?.trim() || null;
}

/** Cover image of the newest published project — the page's hero visual. */
export function heroProject(projects: DesignerProjectCard[]): DesignerProjectCard | null {
  return projects.find((project) => project.coverImageUrl) ?? projects[0] ?? null;
}

/**
 * Caption under the hero image, e.g. "Adyar Penthouse · Chennai".
 * Null when there is no project to caption.
 */
export function heroCaption(project: DesignerProjectCard | null): string | null {
  if (!project) return null;
  return [project.title, project.locality ?? project.city]
    .filter((part): part is string => !!part)
    .join(' · ');
}

/** Distinct property-type facets across the loaded projects, for the gallery filters. */
export function projectFilters(projects: DesignerProjectCard[]): string[] {
  const seen = new Set<string>();
  for (const project of projects) {
    // "4 BHK · Apartment" filters best on its last segment (the dwelling type).
    const facet = project.propertyType?.split('·').pop()?.trim();
    if (facet) seen.add(facet);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Rating rendered to one decimal, matching how ratings read across the product. */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * Human label for a social handle. Designers may enter either a bare handle or a
 * full profile URL; show a leading `@` only for the former.
 */
export function socialLabel(handle: string): string {
  const trimmed = handle.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

type SocialPlatform = 'instagram' | 'linkedin' | 'youtube';

/**
 * Turn the free-form social value stored on a profile into a safe external URL.
 *
 * Full HTTP(S) URLs are preserved. Bare values are resolved against the
 * platform's public profile URL, while non-web schemes are rejected instead of
 * being rendered into a clickable link.
 */
export function socialHref(platform: SocialPlatform, handle: string): string | null {
  const trimmed = handle.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  const path = trimmed.replace(/^\/+/, '');
  if (!path) return null;

  if (platform === 'instagram') {
    const username = path.replace(/^@/, '');
    return username ? `https://www.instagram.com/${encodeURIComponent(username)}` : null;
  }

  if (platform === 'linkedin') {
    const profilePath = path.replace(/^@/, '');
    const normalizedPath = /^(?:company|in|school)\//.test(profilePath)
      ? profilePath
      : `in/${profilePath}`;
    return new URL(normalizedPath, 'https://www.linkedin.com/').toString();
  }

  const channelPath =
    path.startsWith('@') || /^(?:c|channel|user)\//.test(path) ? path : `@${path}`;
  return new URL(channelPath, 'https://www.youtube.com/').toString();
}

/** Website label without the scheme, e.g. "anikaspaces.in". */
export function websiteLabel(websiteUrl: string): string {
  try {
    const url = new URL(websiteUrl);
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return websiteUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}
