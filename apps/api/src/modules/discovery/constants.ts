import { desc, sql } from '@repo/db';
import { schema } from '@repo/db';

/**
 * Allowed filter fields for the discovery feed.
 * Unknown filter parameters are silently ignored (allow-list).
 */
export const DISCOVERY_FILTER_FIELDS = [
  'citySlug',
  'localitySlug',
  'propertyTypeSlug',
  'propertySubtypeSlug',
  'scopeSlug',
  'bhkSlug',
  'budgetBandSlug',
] as const;

export type DiscoveryFilterField = (typeof DISCOVERY_FILTER_FIELDS)[number];

export type DiscoveryFeedFilters = Partial<Record<DiscoveryFilterField, string | string[]>>;

/**
 * Sort mappings for Typesense.
 *
 * Per Typesense documentation:
 * - Supports up to 3 sort fields, comma-separated
 * - Later fields are tie-breakers
 * - For optional numeric fields (like featuredAt), null/missing values
 *   are automatically sorted to the end regardless of sort direction
 *
 * This means featuredAt:desc,publishedAt:desc naturally places:
 * 1. Featured projects (non-null featuredAt) first, by featuredAt desc
 * 2. Non-featured projects (null featuredAt) after, by publishedAt desc
 */
export const SORT_TYPESENSE = {
  recent: 'publishedAt:desc',
  featured: 'featuredAt:desc,publishedAt:desc',
} as const;

export type DiscoverySortTypesense = (typeof SORT_TYPESENSE)[keyof typeof SORT_TYPESENSE];

/**
 * Sort mappings for Postgres (as Drizzle order expressions).
 * Mirrors Typesense behavior exactly, including NULLS LAST for featuredAt.
 */
export const SORT_POSTGRES = {
  recent: [
    desc(schema.project.publishedAt),
    desc(schema.project.id),
  ],
  featured: [
    sql`${schema.project.featuredAt} DESC NULLS LAST`,
    desc(schema.project.publishedAt),
    desc(schema.project.id),
  ],
} as const;

export type DiscoverySortPostgres = (typeof SORT_POSTGRES)[keyof typeof SORT_POSTGRES];
