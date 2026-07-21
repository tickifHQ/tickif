import type {
  SearchQuery,
  SearchResponse,
  SearchHit,
  SuggestResponse,
  SuggestProjectHit,
  SuggestDesignerHit,
  DesignerSearchQuery,
  DesignerSearchResponse,
  DesignerSearchHit,
} from '@repo/contracts';
import { presignDownload } from '@repo/storage';
import { searchRepository } from './repository.js';
import { buildFilterExpression, buildMeiliSort } from './query-builder.js';
import { pageToOffset } from './pagination.js';
import { logSearchQuery, logZeroResults } from './logger.js';
import {
  ALLOWED_PROJECT_FACET_KEYS,
  ALLOWED_DESIGNER_FACET_KEYS,
  FALLBACK_ORDER,
  type ProjectFacetKey,
} from './constants.js';
import type { ProjectSearchDocument, DesignerSearchDocument } from '@repo/search';

/**
 * Search service (E-261).
 *
 * Orchestration layer — owns all business logic:
 * - Allow-list validation
 * - Filter normalization + construction
 * - Fallback ladder (drop facets one at a time)
 * - Postgres fallback for zero-result queries
 * - Response mapping (Meili documents → API contract)
 * - Logging (processingTimeMs, zero-result queries)
 *
 * No Hono, no HTTP concerns — only domain operations.
 */

// ---------------------------------------------------------------------------
// Filter normalization
// ---------------------------------------------------------------------------

/**
 * Extract allowed project filters from the parsed query.
 * Strips unknown keys and empty arrays.
 */
function extractProjectFilters(
  query: SearchQuery,
): Partial<Record<ProjectFacetKey, string[]>> {
  const filters: Partial<Record<ProjectFacetKey, string[]>> = {};
  for (const key of ALLOWED_PROJECT_FACET_KEYS) {
    const values = query[key as keyof SearchQuery] as string[] | undefined;
    if (values && values.length > 0) {
      filters[key] = values;
    }
  }
  return filters;
}

/**
 * Extract allowed designer filters from the parsed query.
 */
function extractDesignerFilters(
  query: DesignerSearchQuery,
): Partial<Record<string, string[]>> {
  const filters: Partial<Record<string, string[]>> = {};
  for (const key of ALLOWED_DESIGNER_FACET_KEYS) {
    if (key === 'entityType') {
      // entityType is a single value, not an array
      if (query.entityType) filters[key] = [query.entityType];
      continue;
    }
    const values = query[key as keyof DesignerSearchQuery] as string[] | undefined;
    if (values && values.length > 0) {
      filters[key] = values;
    }
  }
  return filters;
}

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

async function mapProjectHit(doc: ProjectSearchDocument): Promise<SearchHit> {
  const coverImageUrl = doc.coverImageKey
    ? await presignDownload({ key: doc.coverImageKey })
    : null;

  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    designerId: doc.designerId,
    designerSlug: doc.designerSlug,
    designerName: doc.designerName,
    citySlug: doc.citySlug,
    localitySlug: doc.localitySlug,
    propertyTypeSlug: doc.propertyTypeSlug,
    bhkSlug: doc.bhkSlug,
    budgetBandSlug: doc.budgetBandSlug,
    scopeSlug: doc.scopeSlug,
    themes: doc.themes,
    coverImageUrl,
    publishedAt: doc.publishedAt,
  };
}

async function mapDesignerHit(doc: DesignerSearchDocument): Promise<DesignerSearchHit> {
  const logoUrl = doc.logoImageKey
    ? await presignDownload({ key: doc.logoImageKey })
    : null;

  return {
    id: doc.id,
    slug: doc.slug,
    displayName: doc.displayName,
    bio: doc.bio,
    entityType: doc.entityType,
    citySlugs: doc.citySlugs,
    scopeSlugs: doc.scopeSlugs,
    yearsExperience: doc.yearsExperience,
    projectCount: doc.projectCount,
    avgRating: doc.avgRating,
    reviewCount: doc.reviewCount,
    logoUrl,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const searchService = {
  /**
   * Project search with fallback ladder.
   *
   * 1. Query Meilisearch with all filters.
   * 2. If zero results, drop filters one at a time per FALLBACK_ORDER.
   * 3. If still zero after exhausting the ladder, fall back to Postgres.
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const filters = extractProjectFilters(query);
    const sort = buildMeiliSort(query.sort);
    const { offset, limit } = pageToOffset(query.page, query.limit);
    const relaxedFilters: string[] = [];
    let fallback: 'none' | 'relaxed' | 'recent_in_city' = 'none';

    // Active filters that can be progressively dropped
    const activeFilters = { ...filters };

    // Initial search
    let result = await searchRepository.searchProjects({
      query: query.q,
      filter: buildFilterExpression(activeFilters),
      sort,
      offset,
      limit,
      facets: [...ALLOWED_PROJECT_FACET_KEYS],
    });

    // Fallback ladder: drop one facet at a time until results are found
    if (result.estimatedTotalHits === 0 && Object.keys(activeFilters).length > 0) {
      for (const facet of FALLBACK_ORDER) {
        if (!(facet in activeFilters)) continue;

        relaxedFilters.push(facet);
        delete activeFilters[facet];
        fallback = 'relaxed';

        result = await searchRepository.searchProjects({
          query: query.q,
          filter: buildFilterExpression(activeFilters),
          sort,
          offset,
          limit,
          facets: [...ALLOWED_PROJECT_FACET_KEYS],
        });

        if (result.estimatedTotalHits > 0) break;
      }
    }

    // Postgres fallback: if still zero results after ladder exhaustion
    if (result.estimatedTotalHits === 0) {
      const citySlug = filters.citySlug?.[0] ?? null;
      const recentRows = await searchRepository.recentPublishedInCity(citySlug, limit);

      if (recentRows.length > 0) {
        fallback = 'recent_in_city';
        const hits: SearchHit[] = recentRows.map((row) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          designerId: row.designerId,
          designerSlug: null,
          designerName: '',
          citySlug: row.citySlug,
          localitySlug: null,
          propertyTypeSlug: null,
          bhkSlug: null,
          budgetBandSlug: null,
          scopeSlug: null,
          themes: [],
          coverImageUrl: null,
          publishedAt: row.publishedAt ? row.publishedAt.getTime() : 0,
        }));

        logZeroResults({ q: query.q, filters });
        logSearchQuery({
          q: query.q,
          hits: hits.length,
          processingTimeMs: 0,
          fallback,
          relaxedFilters,
        });

        return {
          hits,
          estimatedTotalHits: hits.length,
          facetDistribution: null,
          processingTimeMs: 0,
          page: query.page,
          limit: query.limit,
          relaxedFilters,
          fallback,
        };
      }

      // Truly zero results even from Postgres
      logZeroResults({ q: query.q, filters });
    }

    // Map Meilisearch hits to API response
    const hits = await Promise.all(result.hits.map(mapProjectHit));

    logSearchQuery({
      q: query.q,
      hits: result.estimatedTotalHits,
      processingTimeMs: result.processingTimeMs,
      fallback,
      relaxedFilters,
    });

    return {
      hits,
      estimatedTotalHits: result.estimatedTotalHits,
      facetDistribution: result.facetDistribution,
      processingTimeMs: result.processingTimeMs,
      page: query.page,
      limit: query.limit,
      relaxedFilters,
      fallback,
    };
  },

  /**
   * Blended suggest: top 5 projects + top 3 designers.
   */
  async suggest(q: string): Promise<SuggestResponse> {
    const result = await searchRepository.multiSearchSuggest(q, 5, 3);

    const projects: SuggestProjectHit[] = await Promise.all(
      result.projects.map(async (doc) => ({
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        designerName: doc.designerName,
        citySlug: doc.citySlug,
        coverImageUrl: doc.coverImageKey
          ? await presignDownload({ key: doc.coverImageKey })
          : null,
      })),
    );

    const designers: SuggestDesignerHit[] = await Promise.all(
      result.designers.map(async (doc) => ({
        id: doc.id,
        slug: doc.slug,
        displayName: doc.displayName,
        citySlugs: doc.citySlugs,
        logoUrl: doc.logoImageKey
          ? await presignDownload({ key: doc.logoImageKey })
          : null,
        projectCount: doc.projectCount,
      })),
    );

    return {
      projects,
      designers,
      processingTimeMs: result.processingTimeMs,
    };
  },

  /**
   * Designer search — no fallback ladder (designers don't have the same zero-result problem).
   */
  async searchDesigners(query: DesignerSearchQuery): Promise<DesignerSearchResponse> {
    const filters = extractDesignerFilters(query);
    const sort = buildMeiliSort(query.sort);
    const { offset, limit } = pageToOffset(query.page, query.limit);

    const result = await searchRepository.searchDesigners({
      query: query.q,
      filter: buildFilterExpression(filters),
      sort,
      offset,
      limit,
      facets: ALLOWED_DESIGNER_FACET_KEYS.filter((k) => k !== 'entityType'),
    });

    const hits = await Promise.all(result.hits.map(mapDesignerHit));

    return {
      hits,
      estimatedTotalHits: result.estimatedTotalHits,
      facetDistribution: result.facetDistribution,
      processingTimeMs: result.processingTimeMs,
      page: query.page,
      limit: query.limit,
    };
  },
};
