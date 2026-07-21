/**
 * Search module constants (E-261).
 *
 * Internal runtime configuration for Meilisearch query construction.
 * These are NOT exposed in the public API contract — they control
 * which filter keys the service accepts and the fallback order.
 */

/**
 * Facet keys accepted by the project search endpoint.
 * Maps 1:1 to `PROJECT_SEARCH_SETTINGS.filterableAttributes` (minus `designerId`
 * which is internal). Any filter key not in this list is silently stripped.
 */
export const ALLOWED_PROJECT_FACET_KEYS = [
  'citySlug',
  'localitySlug',
  'propertyTypeSlug',
  'propertySubtypeSlug',
  'scopeSlug',
  'bhkSlug',
  'budgetBandSlug',
  'themes',
  'materials',
  'finishes',
  'roomSlugs',
] as const;
export type ProjectFacetKey = (typeof ALLOWED_PROJECT_FACET_KEYS)[number];

/**
 * Facet keys accepted by the designer search endpoint.
 * Maps 1:1 to `DESIGNER_SEARCH_SETTINGS.filterableAttributes` (minus internal keys).
 */
export const ALLOWED_DESIGNER_FACET_KEYS = [
  'citySlugs',
  'localitySlugs',
  'scopeSlugs',
  'themeSlugs',
  'entityType',
] as const;
export type DesignerFacetKey = (typeof ALLOWED_DESIGNER_FACET_KEYS)[number];

/**
 * Ordered list of facets to drop during the no-result fallback ladder.
 * The service drops one facet at a time in this order, re-querying after each drop,
 * until results are found or the list is exhausted.
 *
 * Order rationale (narrowest → broadest):
 * - locality: most specific geographic filter
 * - budgetBandSlug: often over-constrains
 * - themes: style preference, not hard requirement
 * - bhkSlug: room-count filter, often too strict
 */
export const FALLBACK_ORDER: readonly ProjectFacetKey[] = [
  'localitySlug',
  'budgetBandSlug',
  'themes',
  'bhkSlug',
];
