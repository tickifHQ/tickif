/**
 * Pagination utilities (E-261).
 *
 * Shared between the search and discovery modules (#261 / #267).
 */

/**
 * Meilisearch paginates via `offset` + `limit` (not page numbers).
 * This converts page-based params to the offset format.
 */
export function pageToOffset(page: number, limit: number): { offset: number; limit: number } {
  return { offset: (page - 1) * limit, limit };
}
