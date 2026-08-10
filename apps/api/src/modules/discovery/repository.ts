import {
  PROJECT_QUERY_BY,
  searchClient,
  searchCollectionName,
  type ProjectSearchDocument,
} from '@repo/search';
import { db, schema, eq, and, or, inArray, sql } from '@repo/db';
import { exists, ilike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  DISCOVERY_FILTER_FIELDS,
  type DiscoveryFeedFilters,
  type DiscoverySortPostgres,
} from './constants.js';
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
  localitySlug: string | null;
  bhkSlug: string | null;
  budgetBandSlug: string | null;
  designerName: string;
  designerSlug: string | null;
  avgRating: string;
  reviewCount: number;
  coverImageId: string | null;
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
  q?: string;
  filterBy: string;
  sortBy: string;
  page: number;
  perPage: number;
}

interface ListFeedFallbackParams {
  q?: string;
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
  'localitySlug',
  'bhkSlug',
  'budgetBandSlug',
  'themes',
  'coverImageKey',
  'coverImageId',
  'coverImageWidth',
  'coverImageHeight',
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
  if (filters.roomSlugs) {
    const values = Array.isArray(filters.roomSlugs) ? filters.roomSlugs : [filters.roomSlugs];
    clauses.push(
      exists(
        db
          .select({ id: schema.projectRoom.id })
          .from(schema.projectRoom)
          .innerJoin(schema.taxonomy, eq(schema.projectRoom.roomTypeId, schema.taxonomy.id))
          .where(
            and(
              eq(schema.projectRoom.projectId, schema.project.id),
              eq(schema.taxonomy.kind, 'room'),
              inArray(schema.taxonomy.slug, values),
            ),
          ),
      ),
    );
  }
  if (filters.themes) {
    const values = Array.isArray(filters.themes) ? filters.themes : [filters.themes];
    clauses.push(
      exists(
        db
          .select({ id: schema.projectImage.id })
          .from(schema.projectImage)
          .where(
            and(
              eq(schema.projectImage.projectId, schema.project.id),
              eq(schema.projectImage.status, 'ready'),
              or(
                ...values.map(
                  (theme) =>
                    sql`${schema.projectImage.themeSlugs} @> ${JSON.stringify([theme])}::jsonb`,
                ),
              ),
            ),
          ),
      ),
    );
  }

  return clauses;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
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
    const sortBy = params.q ? `_text_match:desc,${params.sortBy}` : params.sortBy;
    const result = await client
      .collections<ProjectSearchDocument>(searchCollectionName('projects'))
      .documents()
      .search({
        q: params.q || '*',
        query_by: PROJECT_QUERY_BY.join(','),
        filter_by: params.filterBy || undefined,
        sort_by: sortBy,
        facet_by: DISCOVERY_FILTER_FIELDS.join(','),
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

    const filters = buildPostgresFilters(params.filterBy);
    const where = and(
      eq(schema.project.status, 'published'),
      eq(schema.designerProfile.status, 'active'),
      params.q
        ? or(
            ilike(schema.project.title, `%${escapeLikePattern(params.q)}%`),
            ilike(schema.designerProfile.displayName, `%${escapeLikePattern(params.q)}%`),
          )
        : undefined,
      ...filters,
    );

    const rows = await db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        bhkSlug: schema.project.bhkSlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        designerName: schema.designerProfile.displayName,
        designerSlug: schema.organization.slug,
        avgRating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverImageId: schema.project.coverImageId,
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

  async findThemeSlugs(projectIds: string[]): Promise<Map<string, string[]>> {
    if (projectIds.length === 0) return new Map();
    const rows = await db
      .select({
        projectId: schema.projectImage.projectId,
        themeSlugs: schema.projectImage.themeSlugs,
      })
      .from(schema.projectImage)
      .where(
        and(
          inArray(schema.projectImage.projectId, projectIds),
          eq(schema.projectImage.status, 'ready'),
        ),
      );

    const themes = new Map<string, Set<string>>();
    for (const row of rows) {
      const projectThemes = themes.get(row.projectId) ?? new Set<string>();
      for (const slug of row.themeSlugs) projectThemes.add(slug);
      themes.set(row.projectId, projectThemes);
    }
    return new Map([...themes].map(([projectId, slugs]) => [projectId, [...slugs].sort()]));
  },
};

function extractFacetDistribution(
  facetCounts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>,
): Record<string, Record<string, number>> {
  if (!facetCounts) return {};
  return Object.fromEntries(
    facetCounts.map(({ field_name, counts }) => [
      field_name,
      Object.fromEntries(counts.map(({ value, count }) => [value, count])),
    ]),
  );
}
