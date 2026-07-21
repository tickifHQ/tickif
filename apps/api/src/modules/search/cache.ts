/**
 * Cache-Control constants for public search endpoints (E-261).
 *
 * Shared between the search and discovery modules (#261 / #267).
 * Defined once to prevent drift between endpoints with identical caching semantics.
 */

/** 30s fresh, 120s stale-while-revalidate — per issue spec. */
export const SEARCH_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=120';
