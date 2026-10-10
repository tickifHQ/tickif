import type { VisitorFeedFilters } from '@repo/contracts';
import { FEED_FACET_DEFINITIONS } from '@/lib/feed-params';

export function visitorFeedHref(filters: VisitorFeedFilters): string {
  const params = new URLSearchParams({ feed: 'custom' });
  for (const [apiKey, value] of Object.entries(filters)) {
    const facet = FEED_FACET_DEFINITIONS.find((definition) => definition.apiKey === apiKey);
    if (facet && value) params.set(facet.key, Array.isArray(value) ? value.join(',') : value);
  }
  return `/home?${params.toString()}`;
}
