import { z } from 'zod';

const httpUrlSchema = z.url({ protocol: /^https?$/, normalize: true });

function normalizeHttpUrl(value: string): string | null {
  const parsed = httpUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SocialPlatform = 'instagram' | 'linkedin' | 'youtube';

/**
 * Turn the free-form social value stored on a profile into a safe external URL.
 *
 * Full HTTP(S) URLs are preserved. Bare values are resolved against the
 * platform's public profile URL, while non-web schemes are rejected instead of
 * being rendered into a clickable link.
 */
export function socialProfileHref(platform: SocialPlatform, handle: string): string | null {
  const trimmed = handle.trim();
  if (!trimmed || /[\u0000-\u001f\u007f\\]/.test(trimmed)) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    // Zod uses the web URL parser in both browser and server runtimes.
    const parsed = httpUrlSchema.safeParse(trimmed);
    return parsed.success && !/^https?:\/\/[^/?#]*@/i.test(parsed.data) ? parsed.data : null;
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    /\s/.test(trimmed) ||
    trimmed.startsWith('//') ||
    /[?#]/.test(trimmed)
  )
    return null;

  const path = trimmed.replace(/^\/+/, '');
  if (!path.replace(/^@/, '')) return null;

  if (platform === 'instagram') {
    const username = path.replace(/^@/, '');
    return username ? `https://www.instagram.com/${encodeURIComponent(username)}` : null;
  }

  if (platform === 'linkedin') {
    const profilePath = path.replace(/^@/, '');
    const normalizedPath = /^(?:company|in|school)\//.test(profilePath)
      ? profilePath
      : `in/${profilePath}`;
    return normalizeHttpUrl(`https://www.linkedin.com/${normalizedPath}`);
  }

  const channelPath =
    path.startsWith('@') || /^(?:c|channel|user)\//.test(path) ? path : `@${path}`;
  return normalizeHttpUrl(`https://www.youtube.com/${channelPath}`);
}

/** Shared input validation; drafts deliberately retain partially typed values. */
export function socialProfileValueSchema(platform: SocialPlatform) {
  return z
    .string()
    .trim()
    .max(60, 'Use 60 characters or fewer.')
    .refine(
      (value) => !value || socialProfileHref(platform, value) !== null,
      'Enter a valid handle, profile path or full HTTP(S) profile URL.',
    )
    .meta({ id: `${platform}ProfileValue` });
}
