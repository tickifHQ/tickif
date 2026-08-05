import { DISCOVERY_FILTER_FIELDS } from './constants.js';
import type { DiscoveryFeedFilters } from './constants.js';

/**
 * Escape special characters for Typesense filter values.
 * Typesense requires escaping: [ ] ( ) : , " \
 */
export function escapeFilterValue(value: string): string {
  return value.replace(/[[\]():,"\\ ]/g, '\\$&');
}

/**
 * Build a Typesense filter_by string from validated filter parameters.
 * Applies OR logic within each facet, AND logic between facets.
 * Unknown filter keys are silently ignored (allow-list enforcement).
 */
export function buildDiscoveryFilter(filters: DiscoveryFeedFilters): string {
  const clauses: string[] = [];

  for (const key of DISCOVERY_FILTER_FIELDS) {
    const value = filters[key as keyof DiscoveryFeedFilters];
    if (value === undefined) continue;

    const values = Array.isArray(value) ? value : [value];
    if (values.length === 0) continue;

    const escaped = values.map(escapeFilterValue);
    // OR within facet: citySlug:[mumbai,pune]
    clauses.push(`${key}:[${escaped.join(',')}]`);
  }

  // AND between facets
  return clauses.join(' && ');
}
