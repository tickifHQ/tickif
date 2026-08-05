import {
  searchClient,
  searchCollectionName,
  type ProjectSearchDocument,
} from '@repo/search';
import { db, schema, eq, and, inArray } from '@repo/db';
import { alias } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { DiscoveryFeedFilters, DiscoverySortPostgres } from './constants.js';
import type { Derivative } from '@repo/contracts';

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

/**
 * Build Postgres WHERE clauses from filter parameters.
 * Applies inArray (OR logic) for multi-value filters.
 * Matches Typesense filter semantics (Requirement 4.5).
 */
function buildPostgresFilters(filters: DiscoveryFeedFilters): SQL[] {
  const clauses: SQL[] = [];

  if (filters.citySlug) {
    const values = Array.isArray(filters.citySlug) ? filters.citySlug : [filters.citySlug];
    clauses.push(inArray(schema.project.citySlug, values));
  }
  if (filters.localitySlug) {
    const values = Array.isArray(filters.localitySlug)
      ? filters.localitySlug
      : [filters.localitySlug];
    clauses.push(inArray(schema.project.localitySlug, values));
  }
  if (filters.propertyTypeSlug) {
    const values = Array.isArray(filters.propertyTypeSlug)
      ? filters.propertyTypeSlug
      : [filters.propertyTypeSlug];
    clauses.push(inArray(schema.project.propertyTypeSlug, values));
  }
  if (filters.propertySubtypeSlug) {
    const values = Array.isArray(filters.propertySubtypeSlug)
      ? filters.propertySubtypeSlug
      : [filters.propertySubtypeSlug];
    clauses.push(inArray(schema.project.propertySubtypeSlug, values));
  }
  if (filters.scopeSlug) {
    const values = Array.isArray(filters.scopeSlug) ? filters.scopeSlug : [filters.scopeSlug];
    clauses.push(inArray(schema.project.scopeSlug, values));
  }
  if (filters.bhkSlug) {
    const values = Array.isArray(filters.bhkSlug) ? filters.bhkSlug : [filters.bhkSlug];
    clauses.push(inArray(schema.project.bhkSlug, values));
  }
  if (filters.budgetBandSlug) {
    const values = Array.isArray(filters.budgetBandSlug)
      ? filters.budgetBandSlug
      : [filters.budgetBandSlug];
    clauses.push(inArray(schema.project.budgetBandSlug, values));
  }

  return clauses;
}

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
        page: params.page,
        per_page: params.perPage,
        include_fields: TYPESENSE_INCLUDE_FIELDS,
      });

    return {
      hits: result.hits?.map((hit) => hit.document) ?? [],
      found: result.found ?? 0,
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

    const filters = buildPostgresFilters(params.filterBy);
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
