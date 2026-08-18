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
  'roomSlugs',
  'themes',
] as const;

export type DiscoveryFilterField = (typeof DISCOVERY_FILTER_FIELDS)[number];

export type DiscoveryFeedFilters = Partial<Record<DiscoveryFilterField, string | string[]>>;

/**
 * The taxonomy `kind` backing each facet. This is the vocabulary a facet distribution
 * must cover: the filter UI lists every active term of the kind, so every one of them
 * needs a count — including the zeroes.
 */
export const DISCOVERY_FACET_TAXONOMY_KINDS = {
  citySlug: 'city',
  localitySlug: 'locality',
  propertyTypeSlug: 'property_type',
  propertySubtypeSlug: 'property_subtype',
  scopeSlug: 'scope',
  bhkSlug: 'bhk',
  budgetBandSlug: 'budget_band',
  roomSlugs: 'room',
  themes: 'theme',
} as const satisfies Record<
  DiscoveryFilterField,
  (typeof schema.taxonomyKindEnum.enumValues)[number]
>;

/**
 * `max_facet_values` for the Typesense search. Typesense defaults this to 10, which
 * silently truncates counts to an arbitrary ten values per facet — `room` alone seeds
 * 46 terms and `property_subtype` 38 (E-32). 250 covers every facet's vocabulary with
 * room to grow; the response is a slug→count map, so the extra values are cheap.
 */
export const MAX_FACET_VALUES = 250;

/** Facet counts keyed by facet field, then by taxonomy slug. */
export type FacetDistribution = Record<string, Record<string, number>>;

/** Active taxonomy slugs per facet field — the keys a dense distribution must carry. */
export type FacetVocabulary = Record<DiscoveryFilterField, string[]>;

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
  recent: [desc(schema.project.publishedAt), desc(schema.project.id)],
  featured: [
    sql`${schema.project.featuredAt} DESC NULLS LAST`,
    desc(schema.project.publishedAt),
    desc(schema.project.id),
  ],
} as const;

export type DiscoverySortPostgres = (typeof SORT_POSTGRES)[keyof typeof SORT_POSTGRES];
