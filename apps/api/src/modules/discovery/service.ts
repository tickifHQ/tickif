import type {
  DiscoveryFeedQuery,
  DiscoveryFeedResponse,
  ProjectSearchFallback,
} from '@repo/contracts';
import { discoveryRepository } from './repository.js';
import { buildDiscoveryFilter } from './filter-builder.js';
import {
  collectTaxonomyPairs,
  normalizeTypesenseHit,
  normalizePostgresRow,
  toDiscoveryCard,
  type NormalizedFeedItem,
} from './mapper.js';
import { projectsRepository } from '../projects/repository.js';
import { SORT_TYPESENSE, SORT_POSTGRES } from './constants.js';
import type { DiscoveryFeedFilters } from './constants.js';
import { denseFacetDistribution } from './facets.js';
import { FALLBACK_DROP_ORDER } from '../search/constants.js';

/**
 * Discovery feed service — the ORCHESTRATION layer.
 *
 * Design Invariant 2: Service owns fallback decisions. The repository executes
 * discrete queries; this layer decides when to fall back from Typesense to Postgres.
 *
 * Responsibilities:
 * - Detect Typesense configuration state
 * - Orchestrate feed queries (Typesense primary, Postgres fallback)
 * - Call normalization + shared mapper for contract-identical responses
 * - Log fallback events (fire-and-forget structured JSON)
 *
 * Does NOT import: Hono, Drizzle
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if Typesense is explicitly configured via environment variables.
 *
 * Returns true only when BOTH TYPESENSE_HOST and TYPESENSE_SEARCH_API_KEY
 * are explicitly set in the environment. This enables local development
 * without Typesense — the Postgres fallback activates automatically.
 *
 * @see Requirement 5.1, 5.2, 5.3
 */
export function isTypesenseConfigured(): boolean {
  return !!(process.env.TYPESENSE_HOST && process.env.TYPESENSE_SEARCH_API_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Assembly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a page of normalized items into cards.
 *
 * Taxonomy labels are resolved once for the whole page rather than per card:
 * `toDiscoveryCard` needs a city and a bhk label each, so resolving inside the
 * mapper cost two queries per item — 48 for a default `limit: 24` page on a
 * public endpoint. Shared by both the Typesense and Postgres paths so they stay
 * contract-identical (Design Invariant 1).
 */
async function toCards(items: NormalizedFeedItem[]) {
  if (items.length === 0) return [];
  const localityPairs = items.flatMap((item) =>
    item.citySlug && item.localitySlug
      ? [{ citySlug: item.citySlug, localitySlug: item.localitySlug }]
      : [],
  );
  const [labels, localityLabels] = await Promise.all([
    projectsRepository.findTaxonomyLabels(collectTaxonomyPairs(items)),
    projectsRepository.findLocalityLabels(localityPairs),
  ]);
  return Promise.all(items.map((item) => toDiscoveryCard(item, labels, localityLabels)));
}

async function normalizePostgresRows(
  rows: Awaited<ReturnType<typeof discoveryRepository.listFeedFallback>>['rows'],
): Promise<NormalizedFeedItem[]> {
  const themes = await discoveryRepository.findThemeSlugs(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...normalizePostgresRow(row),
    themeSlugs: themes.get(row.id) ?? [],
  }));
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a structured JSON event when fallback is activated.
 * Fire-and-forget semantics: never throws to callers.
 *
 * @see Requirement 10.1, 10.2, 10.3
 */
export function logFallbackEvent(reason: string, context: { sort: string }): void {
  try {
    console.log(
      JSON.stringify({
        type: 'discovery.fallback',
        reason,
        endpoint: 'GET /api/discovery/feed',
        sort: context.sort,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    // Fire-and-forget: never throw to callers
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Interface
// ─────────────────────────────────────────────────────────────────────────────

interface DiscoveryService {
  getFeed(query: DiscoveryFeedQuery): Promise<DiscoveryFeedResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Implementation
// ─────────────────────────────────────────────────────────────────────────────

export const discoveryService: DiscoveryService = {
  /**
   * Get the discovery feed with automatic fallback from Typesense to Postgres.
   *
   * Flow:
   * 1. If Typesense configured → try searchFeed()
   *    - On success: normalize → toDiscoveryCard → return source: 'search'
   *    - On error: log fallback, fall through to Postgres
   * 2. If Typesense unconfigured OR error:
   *    - Log fallback event
   *    - Call listFeedFallback()
   *    - normalize → toDiscoveryCard → return source: 'db'
   *
   * @see Requirements 3.1, 3.6, 4.1, 4.6, 4.7
   */
  async getFeed(query): Promise<DiscoveryFeedResponse> {
    const { sort, page, limit, q: rawQuery, ...filters } = query;
    const q = rawQuery ?? '';
    const offset = (page - 1) * limit;
    const filterBy = buildDiscoveryFilter(filters);

    // ─────────────────────────────────────────────────────────────────────────
    // Typesense Primary Path
    // ─────────────────────────────────────────────────────────────────────────
    if (isTypesenseConfigured()) {
      try {
        // The vocabulary is what makes zero counts expressible: Typesense only reports
        // facet values it actually matched, so absent options have to be filled in.
        const mutableFilters: DiscoveryFeedFilters = { ...filters };
        const [initialResult, vocabulary] = await Promise.all([
          discoveryRepository.searchFeed({
            q,
            filterBy,
            sortBy: SORT_TYPESENSE[sort],
            page,
            perPage: limit,
          }),
          discoveryRepository.listFacetVocabulary(),
        ]);
        let result = initialResult;
        let fallback: ProjectSearchFallback = 'none';
        const relaxedFilters: string[] = [];

        if (q && page === 1 && result.hits.length === 0) {
          for (const filterKey of FALLBACK_DROP_ORDER) {
            if (mutableFilters[filterKey] === undefined) continue;
            delete mutableFilters[filterKey];
            relaxedFilters.push(filterKey);
            result = await discoveryRepository.searchFeed({
              q,
              filterBy: buildDiscoveryFilter(mutableFilters),
              sortBy: SORT_TYPESENSE[sort],
              page,
              perPage: limit,
            });
            if (result.hits.length > 0) {
              fallback = 'relaxed';
              break;
            }
          }
        }

        if (q && page === 1 && result.hits.length === 0) {
          const citySlug = firstValue(filters.citySlug);
          if (citySlug) {
            const recent = await discoveryRepository.listFeedFallback({
              q: '',
              filterBy: { citySlug },
              sortBy: SORT_POSTGRES.recent,
              limit,
              offset: 0,
            });
            if (recent.rows.length > 0) {
              // This answer comes from Postgres, so it is a fallback like any other and has
              // to show up in the fallback log — otherwise a `source: 'db'` response with
              // Typesense healthy is invisible to operators.
              logFallbackEvent('recent_in_city', { sort });
              const recentFacetCounts = await discoveryRepository.countFeedFacets({ citySlug });
              return {
                items: await toCards(await normalizePostgresRows(recent.rows)),
                page,
                limit,
                // Deliberately false. Relaxation only runs on page 1, so page 2 of this
                // query would re-run the original search and come back empty — advertising
                // `hasMore: true` on a full fallback page points the client at a dead end.
                hasMore: false,
                source: 'db',
                facetDistribution: denseFacetDistribution(vocabulary, recentFacetCounts),
                fallback: 'recent_in_city',
                // The relaxation attempts above all failed (they are why we got here), so
                // reporting them would claim credit for drops that changed nothing.
                relaxedFilters: [],
              };
            }
          }
        }

        // Normalize then map through shared mapper (Design Invariant 1)
        const items = await toCards(result.hits.map(normalizeTypesenseHit));
        const hasMore = result.found > offset + result.hits.length;
        const responseRelaxedFilters = fallback === 'none' ? [] : relaxedFilters;

        return {
          items,
          page,
          limit,
          hasMore,
          source: 'search' as const,
          facetDistribution: denseFacetDistribution(vocabulary, result.facetDistribution ?? {}),
          fallback,
          relaxedFilters: responseRelaxedFilters,
        };
      } catch (error) {
        // Fallback on Typesense error
        const reason = error instanceof Error ? error.message : 'unknown';
        logFallbackEvent(reason, { sort });
        // Fall through to Postgres path
      }
    } else {
      logFallbackEvent('unconfigured', { sort });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Postgres Fallback Path
    // ─────────────────────────────────────────────────────────────────────────
    const [initialResult, initialFacetCounts, vocabulary] = await Promise.all([
      discoveryRepository.listFeedFallback({
        q,
        filterBy: filters,
        sortBy: SORT_POSTGRES[sort],
        limit,
        offset,
      }),
      discoveryRepository.countFeedFacets(filters, q),
      discoveryRepository.listFacetVocabulary(),
    ]);
    let result = initialResult;
    let facetCounts = initialFacetCounts;
    // Only 'none' or 'recent_in_city' are reachable here: filter relaxation is a Typesense
    // affordance (it needs `_text_match` ranking to be worth anything), so this path never
    // reports 'relaxed' and never has relaxed filters to name.
    let fallback: ProjectSearchFallback = 'none';

    if (q && page === 1 && result.rows.length === 0) {
      const citySlug = firstValue(filters.citySlug);
      if (citySlug) {
        result = await discoveryRepository.listFeedFallback({
          q: '',
          filterBy: { citySlug },
          sortBy: SORT_POSTGRES.recent,
          limit,
          offset: 0,
        });
        if (result.rows.length > 0) {
          fallback = 'recent_in_city';
          facetCounts = await discoveryRepository.countFeedFacets({ citySlug });
        }
      }
    }

    // Normalize then map through shared mapper (SAME as Typesense path)
    // This enforces contract-identical responses (Design Invariant 1)
    const items = await toCards(await normalizePostgresRows(result.rows));
    // A `recent_in_city` page is a terminus: it re-queried at offset 0 with different
    // filters, and page 2 would fall back to the original (empty) query, so there is
    // nothing more to page to.
    const hasMore = fallback === 'recent_in_city' ? false : result.rows.length === limit;

    return {
      items,
      page,
      limit,
      hasMore,
      source: 'db' as const,
      facetDistribution: denseFacetDistribution(vocabulary, facetCounts),
      fallback,
      relaxedFilters: [],
    };
  },
};
