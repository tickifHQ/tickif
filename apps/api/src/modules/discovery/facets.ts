import { DISCOVERY_FILTER_FIELDS } from './constants.js';
import type { FacetDistribution, FacetVocabulary } from './constants.js';

/**
 * Facet-distribution assembly, shared by both feed paths (Design Invariant 1).
 *
 * Neither backend can produce the map the filter UI needs on its own:
 * - Typesense omits zero-count values entirely — it never emits `count: 0` — so a raw
 *   `facet_counts` response cannot tell "no published project has this term" apart from
 *   "this term does not exist".
 * - The Postgres fallback aggregates the same way: a `GROUP BY` only yields rows for
 *   values that occur.
 *
 * So we densify: start from the taxonomy vocabulary the UI renders and default every
 * absent term to `0`. Callers get one entry per option, always, from either path.
 */

/**
 * Project a sparse slug→count map onto the full taxonomy vocabulary, defaulting to 0.
 *
 * The vocabulary is authoritative in both directions: a slug it does not list is dropped
 * even if the backend counted it (a retired term, say). The filter UI only renders active
 * taxonomy options, so a count it cannot attach to an option is noise.
 */
export function denseFacetDistribution(
  vocabulary: FacetVocabulary,
  counts: FacetDistribution,
): FacetDistribution {
  return Object.fromEntries(
    DISCOVERY_FILTER_FIELDS.map((field) => {
      const fieldCounts = counts[field] ?? {};
      return [
        field,
        Object.fromEntries(vocabulary[field].map((slug) => [slug, fieldCounts[slug] ?? 0])),
      ];
    }),
  );
}

/** An empty vocabulary — every facet present, no options. */
export function emptyFacetVocabulary(): FacetVocabulary {
  return {
    citySlug: [],
    localitySlug: [],
    propertyTypeSlug: [],
    propertySubtypeSlug: [],
    scopeSlug: [],
    bhkSlug: [],
    budgetBandSlug: [],
    roomSlugs: [],
    themes: [],
  };
}
