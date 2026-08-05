/**
 * Search service layer — orchestrates search queries with fallback logic.
 *
 * Responsibilities:
 * - Coordinate Typesense search via repository
 * - Execute fallback ladder for project search (progressive filter relaxation)
 * - Fall back to Postgres for recent projects in city when Typesense exhausted
 * - Map results to API response shapes via mapper
 * - Structured logging (fire-and-forget)
 *
 * Architecture rules enforced:
 * - NO Hono imports (service layer)
 * - NO Drizzle imports (repository layer only)
 * - NO direct Typesense types (use repository functions)
 */
import type {
  SearchProjectsQuery,
  SearchProjectsResponse,
  SearchDesignersQuery,
  SearchDesignersResponse,
  SearchSuggestQuery,
  SearchSuggestResponse,
  ProjectSearchFallback,
} from '@repo/contracts';
import { PROJECT_QUERY_BY, DESIGNER_QUERY_BY } from '@repo/search';
import * as repository from './repository.js';
import { buildProjectFilter, buildDesignerFilter } from './filter-builder.js';
import {
  mapProjectHit,
  mapDesignerHit,
  mapSuggestProject,
  mapSuggestDesigner,
  mapRecentProject,
} from './mapper.js';
import {
  FALLBACK_DROP_ORDER,
  PROJECT_FACET_FIELDS,
  DESIGNER_FACET_FIELDS,
  PROJECT_SORT_OPTIONS,
  DESIGNER_SORT_OPTIONS,
} from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Structured Logging (Fire-and-Forget)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logged for every search request
 */
interface SearchQueryEvent {
  type: 'search.query';
  endpoint: 'projects' | 'designers' | 'suggest';
  q: string;
  filters: Record<string, string | string[]>;
  sort: string;
  page: number;
  limit: number;
  resultCount: number;
  processingTimeMs: number;
  fallback: ProjectSearchFallback;
  relaxedFilters: string[];
  timestamp: string; // ISO 8601
}

/**
 * Logged when original query returns zero hits
 */
interface SearchZeroResultsEvent {
  type: 'search.zero_results';
  endpoint: 'projects' | 'designers' | 'suggest';
  q: string;
  filters: Record<string, string | string[]>;
  timestamp: string;
}

/**
 * Fire-and-forget search query logging.
 * Never throws — logging failures are silently ignored.
 */
function logSearchQuery(event: SearchQueryEvent): void {
  try {
    console.log(JSON.stringify(event));
  } catch {
    // Fire-and-forget: never throw to callers
  }
}

/**
 * Fire-and-forget zero results logging.
 * Never throws — logging failures are silently ignored.
 */
function logZeroResults(event: SearchZeroResultsEvent): void {
  try {
    console.log(JSON.stringify(event));
  } catch {
    // Fire-and-forget: never throw to callers
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Extraction Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract filter fields from a project search query into a filter object.
 */
function extractProjectFilters(
  query: SearchProjectsQuery,
): Record<string, string | string[] | undefined> {
  return {
    citySlug: query.citySlug,
    localitySlug: query.localitySlug,
    propertyTypeSlug: query.propertyTypeSlug,
    propertySubtypeSlug: query.propertySubtypeSlug,
    scopeSlug: query.scopeSlug,
    bhkSlug: query.bhkSlug,
    budgetBandSlug: query.budgetBandSlug,
    themes: query.themes,
    materials: query.materials,
    finishes: query.finishes,
    roomSlugs: query.roomSlugs,
  };
}

/**
 * Extract filter fields from a designer search query into a filter object.
 */
function extractDesignerFilters(
  query: SearchDesignersQuery,
): Record<string, string | string[] | undefined> {
  return {
    citySlugs: query.citySlugs,
    localitySlugs: query.localitySlugs,
    scopeSlugs: query.scopeSlugs,
    themeSlugs: query.themeSlugs,
    entityType: query.entityType,
  };
}

/**
 * Count non-undefined filter values.
 */
function hasFilters(
  filters: Record<string, string | string[] | undefined>,
): boolean {
  return Object.values(filters).some((v) => v !== undefined);
}

/**
 * Convert filters to a loggable record (only defined values).
 */
function toLoggableFilters(
  filters: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search projects with fallback ladder logic.
 *
 * 1. Execute initial search with all filters
 * 2. If zero results and filters present: progressively drop filters
 * 3. If still zero results and citySlug present: fall back to Postgres recent projects
 */
export async function searchProjects(
  query: SearchProjectsQuery,
): Promise<SearchProjectsResponse> {
  const startTime = Date.now();
  const filters = extractProjectFilters(query);
  const mutableFilters = { ...filters };

  // Build initial search params
  const filterBy = buildProjectFilter(mutableFilters);
  const sortBy = PROJECT_SORT_OPTIONS[query.sort];

  const searchParams: repository.TypesenseSearchParams = {
    q: query.q,
    query_by: PROJECT_QUERY_BY.join(','),
    filter_by: filterBy || undefined,
    sort_by: sortBy,
    facet_by: PROJECT_FACET_FIELDS.join(','),
    page: query.page,
    per_page: query.limit,
  };

  // Initial search
  let result = await repository.searchProjects(searchParams);
  let fallback: ProjectSearchFallback = 'none';
  const relaxedFilters: string[] = [];

  // Check if we have results or no filters to relax
  if (result.hits.length > 0 || !hasFilters(filters)) {
    // Map hits and return
    const hits = await Promise.all(result.hits.map(mapProjectHit));

    // Log search event
    logSearchQuery({
      type: 'search.query',
      endpoint: 'projects',
      q: query.q,
      filters: toLoggableFilters(filters),
      sort: query.sort,
      page: query.page,
      limit: query.limit,
      resultCount: hits.length,
      processingTimeMs: Date.now() - startTime,
      fallback,
      relaxedFilters,
      timestamp: new Date().toISOString(),
    });

    return {
      hits,
      estimatedTotalHits: result.estimatedTotalHits,
      facetDistribution: result.facetDistribution,
      processingTimeMs: result.processingTimeMs,
      page: query.page,
      limit: query.limit,
      fallback,
      relaxedFilters,
    };
  }

  // Log zero results for original query
  logZeroResults({
    type: 'search.zero_results',
    endpoint: 'projects',
    q: query.q,
    filters: toLoggableFilters(filters),
    timestamp: new Date().toISOString(),
  });

  // Execute fallback ladder: drop filters one by one
  for (const filterKey of FALLBACK_DROP_ORDER) {
    if (mutableFilters[filterKey] !== undefined) {
      // Drop this filter
      delete mutableFilters[filterKey];
      relaxedFilters.push(filterKey);

      // Rebuild filter_by and re-query
      const relaxedFilterBy = buildProjectFilter(mutableFilters);
      const relaxedParams: repository.TypesenseSearchParams = {
        ...searchParams,
        filter_by: relaxedFilterBy || undefined,
      };

      result = await repository.searchProjects(relaxedParams);

      if (result.hits.length > 0) {
        fallback = 'relaxed';
        const hits = await Promise.all(result.hits.map(mapProjectHit));

        // Log search event with fallback info
        logSearchQuery({
          type: 'search.query',
          endpoint: 'projects',
          q: query.q,
          filters: toLoggableFilters(filters),
          sort: query.sort,
          page: query.page,
          limit: query.limit,
          resultCount: hits.length,
          processingTimeMs: Date.now() - startTime,
          fallback,
          relaxedFilters,
          timestamp: new Date().toISOString(),
        });

        return {
          hits,
          estimatedTotalHits: result.estimatedTotalHits,
          facetDistribution: result.facetDistribution,
          processingTimeMs: result.processingTimeMs,
          page: query.page,
          limit: query.limit,
          fallback,
          relaxedFilters,
        };
      }
    }
  }

  // Postgres fallback: recent projects in city
  if (query.citySlug) {
    const citySlug = Array.isArray(query.citySlug)
      ? query.citySlug[0]
      : query.citySlug;

    if (citySlug) {
      const recentProjects = await repository.recentProjectsInCity(
        citySlug,
        query.limit,
      );

      if (recentProjects.length > 0) {
        fallback = 'recent_in_city';
        const hits = await Promise.all(recentProjects.map(mapRecentProject));

        // Log search event with Postgres fallback
        logSearchQuery({
          type: 'search.query',
          endpoint: 'projects',
          q: query.q,
          filters: toLoggableFilters(filters),
          sort: query.sort,
          page: query.page,
          limit: query.limit,
          resultCount: hits.length,
          processingTimeMs: Date.now() - startTime,
          fallback,
          relaxedFilters,
          timestamp: new Date().toISOString(),
        });

        return {
          hits,
          estimatedTotalHits: recentProjects.length,
          facetDistribution: {}, // No facets from Postgres fallback
          processingTimeMs: Date.now() - startTime,
          page: query.page,
          limit: query.limit,
          fallback,
          relaxedFilters,
        };
      }
    }
  }

  // No results found even after all fallbacks
  const hits = await Promise.all(result.hits.map(mapProjectHit));

  logSearchQuery({
    type: 'search.query',
    endpoint: 'projects',
    q: query.q,
    filters: toLoggableFilters(filters),
    sort: query.sort,
    page: query.page,
    limit: query.limit,
    resultCount: 0,
    processingTimeMs: Date.now() - startTime,
    fallback: 'none',
    relaxedFilters: [],
    timestamp: new Date().toISOString(),
  });

  return {
    hits,
    estimatedTotalHits: result.estimatedTotalHits,
    facetDistribution: result.facetDistribution,
    processingTimeMs: result.processingTimeMs,
    page: query.page,
    limit: query.limit,
    fallback: 'none',
    relaxedFilters: [],
  };
}

/**
 * Search designers (no fallback ladder).
 *
 * Direct search against Typesense with filter support.
 */
export async function searchDesigners(
  query: SearchDesignersQuery,
): Promise<SearchDesignersResponse> {
  const startTime = Date.now();
  const filters = extractDesignerFilters(query);

  // Build search params
  const filterBy = buildDesignerFilter(filters);
  const sortBy = DESIGNER_SORT_OPTIONS[query.sort];

  const searchParams: repository.TypesenseSearchParams = {
    q: query.q,
    query_by: DESIGNER_QUERY_BY.join(','),
    filter_by: filterBy || undefined,
    sort_by: sortBy,
    facet_by: DESIGNER_FACET_FIELDS.join(','),
    page: query.page,
    per_page: query.limit,
  };

  // Execute search
  const result = await repository.searchDesigners(searchParams);

  // Map hits
  const hits = await Promise.all(result.hits.map(mapDesignerHit));

  // Log zero results if applicable
  if (result.hits.length === 0 && hasFilters(filters)) {
    logZeroResults({
      type: 'search.zero_results',
      endpoint: 'designers',
      q: query.q,
      filters: toLoggableFilters(filters),
      timestamp: new Date().toISOString(),
    });
  }

  // Log search event
  logSearchQuery({
    type: 'search.query',
    endpoint: 'designers',
    q: query.q,
    filters: toLoggableFilters(filters),
    sort: query.sort,
    page: query.page,
    limit: query.limit,
    resultCount: hits.length,
    processingTimeMs: Date.now() - startTime,
    fallback: 'none',
    relaxedFilters: [],
    timestamp: new Date().toISOString(),
  });

  return {
    hits,
    estimatedTotalHits: result.estimatedTotalHits,
    facetDistribution: result.facetDistribution,
    processingTimeMs: result.processingTimeMs,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * Blended suggest (autocomplete) for projects and designers.
 *
 * Uses multiSearch to query both collections in a single request.
 */
export async function suggest(
  query: SearchSuggestQuery,
): Promise<SearchSuggestResponse> {
  const startTime = Date.now();

  // Execute multi-search
  const result = await repository.multiSearch(query.q);

  // Map results
  const [projects, designers] = await Promise.all([
    Promise.all(result.projects.map(mapSuggestProject)),
    Promise.all(result.designers.map(mapSuggestDesigner)),
  ]);

  // Log search event
  logSearchQuery({
    type: 'search.query',
    endpoint: 'suggest',
    q: query.q,
    filters: {},
    sort: 'relevance',
    page: 1,
    limit: 8, // 5 projects + 3 designers
    resultCount: projects.length + designers.length,
    processingTimeMs: Date.now() - startTime,
    fallback: 'none',
    relaxedFilters: [],
    timestamp: new Date().toISOString(),
  });

  return {
    projects,
    designers,
    processingTimeMs: result.processingTimeMs,
  };
}
