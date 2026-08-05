/**
 * Search module constants
 *
 * API-module-specific constants for search endpoints.
 * These constants stay in the API module only (NOT shared to @repo/search).
 *
 * @repo/search owns: PROJECT_QUERY_BY, DESIGNER_QUERY_BY, PROJECT_DEFAULT_SORT, DESIGNER_DEFAULT_SORT
 * This module owns: facet lists, suggest fields, fallback order, sort option mappings
 */

/**
 * Project facet fields for filtering and facet distribution
 * Used for filter allow-listing and facet_by parameter
 */
export const PROJECT_FACET_FIELDS = [
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

/**
 * Project fields to include in suggest (autocomplete) responses
 * Minimal fields for fast autocomplete results
 */
export const PROJECT_SUGGEST_FIELDS = [
  'id',
  'slug',
  'title',
  'designerName',
  'citySlug',
  'coverImageKey',
] as const;

/**
 * Designer facet fields for filtering and facet distribution
 * Used for filter allow-listing and facet_by parameter
 */
export const DESIGNER_FACET_FIELDS = [
  'entityType',
  'citySlugs',
  'localitySlugs',
  'scopeSlugs',
  'themeSlugs',
] as const;

/**
 * Designer fields to include in suggest (autocomplete) responses
 * Minimal fields for fast autocomplete results
 */
export const DESIGNER_SUGGEST_FIELDS = [
  'id',
  'slug',
  'displayName',
  'citySlugs',
  'logoImageKey',
  'projectCount',
] as const;

/**
 * Order in which filters are dropped during the fallback ladder
 * When a search returns zero results, filters are dropped one by one
 * in this order to find relevant results
 */
export const FALLBACK_DROP_ORDER = [
  'localitySlug',
  'budgetBandSlug',
  'themes',
  'bhkSlug',
] as const;

/**
 * Project sort options mapping
 * Maps user-facing sort option names to Typesense sort_by parameter values
 * - 'relevance' uses undefined to omit sort param and use ranking rules
 */
export const PROJECT_SORT_OPTIONS = {
  relevance: undefined, // Omit sort param, use ranking rules
  'publishedAt:desc': 'publishedAt:desc',
  'publishedAt:asc': 'publishedAt:asc',
  'sizeSqft:asc': 'sizeSqft:asc',
  'sizeSqft:desc': 'sizeSqft:desc',
} as const;

/**
 * Designer sort options mapping
 * Maps user-facing sort option names to Typesense sort_by parameter values
 * - 'relevance' uses undefined to omit sort param and use ranking rules
 */
export const DESIGNER_SORT_OPTIONS = {
  relevance: undefined,
  'avgRating:desc': 'avgRating:desc',
  'projectCount:desc': 'projectCount:desc',
  'reviewCount:desc': 'reviewCount:desc',
  'yearsExperience:desc': 'yearsExperience:desc',
} as const;

// Type exports for use in other modules
export type ProjectFacetField = (typeof PROJECT_FACET_FIELDS)[number];
export type ProjectSuggestField = (typeof PROJECT_SUGGEST_FIELDS)[number];
export type DesignerFacetField = (typeof DESIGNER_FACET_FIELDS)[number];
export type DesignerSuggestField = (typeof DESIGNER_SUGGEST_FIELDS)[number];
export type FallbackDropField = (typeof FALLBACK_DROP_ORDER)[number];
export type ProjectSortOption = keyof typeof PROJECT_SORT_OPTIONS;
export type DesignerSortOption = keyof typeof DESIGNER_SORT_OPTIONS;
