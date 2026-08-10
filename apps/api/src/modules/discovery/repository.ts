import { searchClient, searchCollectionName, type ProjectSearchDocument } from '@repo/search';
import { db, schema, eq, and } from '@repo/db';
import { alias } from 'drizzle-orm/pg-core';
import {
  DISCOVERY_FILTER_FIELDS,
  type DiscoveryFeedFilters,
  type DiscoverySortPostgres,
} from './constants.js';
import type { Derivative } from '@repo/contracts';
import { projectFeedFilterClauses } from '../projects/feed-filters.repository.js';

/**
 * Discovery feed repository — the ONLY layer importing Drizzle/Typesense.
 *
 * Design Invariant 2: Both methods are independent operations. The service layer
 * owns fallback decisions; the repository executes discrete queries.
 *
 * Design Invariant 3: Minimal projection. Only fetch fields required by DiscoveryCard.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain Types
// ─────────────────────────────────────────────────────────────────────────────

/** Typesense search result with minimal projected fields. */
export interface TypesenseSearchResult {
  hits: ProjectSearchDocument[];
  found: number;
  facetDistribution?: Record<string, Record<string, number>>;
}

/**
 * Postgres result row for the discovery feed.
 * Minimal projection — only fields required by DiscoveryCard (Requirement 7).
 */
export interface FeedProjectRow {
  id: string;
  slug: string;
  title: string;
  citySlug: string | null;
  bhkSlug: string | null;
  designerName: string;
  designerSlug: string | null;
  avgRating: string;
  reviewCount: number;
  coverStatus: 'processing' | 'ready' | 'failed' | null;
  coverDerivatives: Derivative[] | null;
}

/** Postgres fallback result wrapper. */
export interface PostgresListResult {
  rows: FeedProjectRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parameter Types
// ─────────────────────────────────────────────────────────────────────────────

interface SearchFeedParams {
  filterBy: string;
  sortBy: string;
  page: number;
  perPage: number;
}

interface ListFeedFallbackParams {
  filterBy: DiscoveryFeedFilters;
  sortBy: DiscoverySortPostgres;
  limit: number;
  offset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal field projection for Typesense — only what DiscoveryCard needs.
 * Matches Design Invariant 3 (Minimal Projection).
 */
const TYPESENSE_INCLUDE_FIELDS = [
  'id',
  'slug',
  'title',
  'designerSlug',
  'designerName',
  'citySlug',
  'bhkSlug',
  'coverImageKey',
  'avgRating',
  'reviewCount',
].join(',');

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export const discoveryRepository = {
  /**
   * Typesense primary path: query the projects alias collection.
   * Uses minimal field projection — only fetches what DiscoveryCard needs.
   *
   * @see Requirement 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async searchFeed(params: SearchFeedParams): Promise<TypesenseSearchResult> {
    const client = searchClient();
    const result = await client
      .collections<ProjectSearchDocument>(searchCollectionName('projects'))
      .documents()
      .search({
        q: '*',
        filter_by: params.filterBy || undefined,
        sort_by: params.sortBy,
        facet_by: DISCOVERY_FILTER_FIELDS.join(','),
        max_facet_values: 250,
        page: params.page,
        per_page: params.perPage,
        include_fields: TYPESENSE_INCLUDE_FIELDS,
      });

    return {
      hits: result.hits?.map((hit) => hit.document) ?? [],
      found: result.found ?? 0,
      facetDistribution: extractFacetDistribution(result.facet_counts),
    };
  },

  /**
   * Postgres fallback path: query published projects with active designers.
   * Single query with INNER JOIN (designer_profile, organization) and LEFT JOIN (cover).
   * No N+1 queries for designer data.
   * Only selects fields required by DiscoveryCard.
   * Uses NULLS LAST for featured sort to match Typesense behavior.
   *
   * @see Requirement 4.1, 4.2, 4.3, 4.4, 4.5
   */
  async listFeedFallback(params: ListFeedFallbackParams): Promise<PostgresListResult> {
    const cover = alias(schema.projectImage, 'cover');

    const filters = projectFeedFilterClauses(params.filterBy);
    const where = and(
      eq(schema.project.status, 'published'),
      eq(schema.designerProfile.status, 'active'),
      ...filters,
    );

    const rows = await db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        bhkSlug: schema.project.bhkSlug,
        designerName: schema.designerProfile.displayName,
        designerSlug: schema.organization.slug,
        avgRating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverStatus: cover.status,
        coverDerivatives: cover.derivatives,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
      .where(where)
      .orderBy(...params.sortBy)
      .limit(params.limit)
      .offset(params.offset);

    return { rows };
  },
};

function extractFacetDistribution(
  facetCounts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>,
): Record<string, Record<string, number>> {
  // Typesense omits zero-count facet values; consumers must treat a missing
  // value inside a present facet bucket as zero.
  if (!facetCounts) return {};
  return Object.fromEntries(
    facetCounts.map(({ field_name, counts }) => [
      field_name,
      Object.fromEntries(counts.map(({ value, count }) => [value, count])),
    ]),
  );
}
