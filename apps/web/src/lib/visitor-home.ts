import type { VisitorFeedFilters } from '@repo/contracts';
import type { FeedFacetOptions } from '@/components/feed-filters';
import type { FeedFilterKey, FeedFilterState } from '@/lib/feed-params';
import { visitorFeedHref } from '@/lib/visitor-feed';

export function enquiryActivityAge(value: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

/** Describe the current URL, not preferences that the visitor has since cleared. */
export function visitorFeedSummary(filters: FeedFilterState, options: FeedFacetOptions): string[] {
  const labels = (key: FeedFilterKey) =>
    filters[key].map(
      (slug) =>
        options[key]?.find((term) => term.slug === slug)?.label ??
        slug
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
    );
  const location = [...labels('locality'), ...labels('city')].join(', ');
  return [
    ...labels('bhk'),
    ...labels('propertySubtype'),
    ...(location ? [location] : []),
    ...labels('budgetBand'),
    ...labels('theme'),
  ];
}

/** Near you uses the saved location only; it never guesses a location from the browser. */
export function visitorNearYouHref(filters: VisitorFeedFilters): string | null {
  if (!filters.citySlug) return null;
  return `${visitorFeedHref({ citySlug: filters.citySlug, localitySlug: filters.localitySlug })}&view=nearby`;
}
