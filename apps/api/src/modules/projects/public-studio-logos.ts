import { presignDownload } from '@repo/storage';
import { projectsRepository } from './repository.js';
import { log } from '../../lib/logger.js';
import { withPublicStudioVerification } from './public-studio-verification.js';

/** One lookup per page and one signed URL per distinct public logo, not per card. */
export async function withPublicStudioLogos<T extends { id: string }>(items: T[]) {
  if (items.length === 0) return [];
  const verifiedItems = withPublicStudioVerification(items);
  let keys: Map<string, string>;
  try {
    keys = await projectsRepository.findPublicStudioLogoKeys(items.map((item) => item.id));
  } catch {
    // Identity media is optional: a lookup outage must not blank search/discovery.
    log.warn({ event: 'feed.studio_logos.unavailable' }, 'Studio logo lookup unavailable');
    keys = new Map();
  }
  const signed = new Map(
    await Promise.all(
      [...new Set(keys.values())].map(
        async (key) => [key, await presignDownload({ key }).catch(() => null)] as const,
      ),
    ),
  );
  return (await verifiedItems).map((item) => ({
    ...item,
    studioLogoUrl: signed.get(keys.get(item.id) ?? '') ?? null,
  }));
}
