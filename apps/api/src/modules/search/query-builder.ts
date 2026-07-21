/**
 * Meilisearch query construction utilities (E-261).
 *
 * Shared between the search and discovery modules (#261 / #267).
 * Translates typed filter maps into Meilisearch filter syntax.
 */

/**
 * Build a Meilisearch filter expression from a map of facet → values.
 *
 * Semantics:
 * - OR within a facet: `(citySlug = "mumbai" OR citySlug = "pune")`
 * - AND across facets: `(...) AND (...)`
 *
 * Returns an empty string when no filters are active (no filter applied to Meili query).
 */
export function buildFilterExpression(
  filters: Partial<Record<string, string[]>>,
): string {
  const clauses: string[] = [];

  for (const [key, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue;

    const orClauses = values.map(
      // Escape filter values before embedding in Meilisearch filter expressions.
      // Current taxonomy slugs cannot contain quotes or backslashes, but escaping is
      // retained as a defense-in-depth measure for future filter types.
      (v) => `${key} = "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    );
    clauses.push(orClauses.length === 1 ? orClauses[0]! : `(${orClauses.join(' OR ')})`);
  }

  return clauses.join(' AND ');
}

/**
 * Translate an API sort value into Meilisearch's sort array format.
 *
 * "relevance" means no explicit sort (Meilisearch uses ranking rules).
 * Everything else maps directly: "publishedAt:desc" → ["publishedAt:desc"].
 */
export function buildMeiliSort(sort: string): string[] {
  if (sort === 'relevance') return [];
  return [sort];
}
