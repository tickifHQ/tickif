import { searchClient, searchCollectionName, type ProjectSearchDocument } from '@repo/search';
import { db, schema, eq, and, asc, inArray, sql } from '@repo/db';
import { alias } from 'drizzle-orm/pg-core';
import {
  DISCOVERY_FACET_TAXONOMY_KINDS,
  DISCOVERY_FILTER_FIELDS,
  MAX_FACET_VALUES,
  type DiscoveryFeedFilters,
  type DiscoveryFilterField,
  type DiscoverySortPostgres,
  type FacetDistribution,
  type FacetVocabulary,
} from './constants.js';
import { emptyFacetVocabulary } from './facets.js';
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
  facetDistribution?: FacetDistribution;
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
  budgetBandSlug: string | null;
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
  'budgetBandSlug',
  'coverImageKey',
  'avgRating',
  'reviewCount',
].join(',');

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Facet field for a taxonomy kind — the inverse of `DISCOVERY_FACET_TAXONOMY_KINDS`. */
const FACET_FIELD_BY_TAXONOMY_KIND = new Map<string, DiscoveryFilterField>(
  Object.entries(DISCOVERY_FACET_TAXONOMY_KINDS).map(([field, kind]) => [
    kind,
    field as DiscoveryFilterField,
  ]),
);

/** The taxonomy kinds a facet distribution draws its vocabulary from. */
const FACET_TAXONOMY_KINDS: (typeof schema.taxonomyKindEnum.enumValues)[number][] = [
  ...new Set(Object.values(DISCOVERY_FACET_TAXONOMY_KINDS)),
];

/**
 * Visibility + filter predicate shared by the fallback listing and its facet counts, so a
 * count can never describe a different set of projects than the page it labels.
 */
function feedVisibilityWhere(filters: DiscoveryFeedFilters) {
  return and(
    eq(schema.project.status, 'published'),
    eq(schema.designerProfile.status, 'active'),
    ...projectFeedFilterClauses(filters),
  );
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
        facet_by: DISCOVERY_FILTER_FIELDS.join(','),
        max_facet_values: MAX_FACET_VALUES,
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

    const where = feedVisibilityWhere(params.filterBy);

    const rows = await db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        citySlug: schema.project.citySlug,
        bhkSlug: schema.project.bhkSlug,
        budgetBandSlug: schema.project.budgetBandSlug,
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

  /**
   * Active taxonomy slugs per facet — the vocabulary the filter UI renders, and so the key
   * set a facet distribution has to cover. Mirrors the taxonomy module's read policy
   * (`is_active` only), which is what `GET /api/taxonomy/terms` feeds the UI. Locality
   * slugs are only unique within a city, so identical slugs under two cities collapse to
   * one entry — exactly how `project.locality_slug` and the Typesense facet treat them.
   */
  async listFacetVocabulary(): Promise<FacetVocabulary> {
    const rows = await db
      .select({ kind: schema.taxonomy.kind, slug: schema.taxonomy.slug })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.isActive, true),
          inArray(schema.taxonomy.kind, FACET_TAXONOMY_KINDS),
        ),
      )
      .orderBy(asc(schema.taxonomy.sortOrder), asc(schema.taxonomy.label));

    const slugsByField = new Map<DiscoveryFilterField, Set<string>>();
    for (const row of rows) {
      const field = FACET_FIELD_BY_TAXONOMY_KIND.get(row.kind);
      if (!field) continue;
      const slugs = slugsByField.get(field) ?? new Set<string>();
      slugs.add(row.slug);
      slugsByField.set(field, slugs);
    }

    const vocabulary = emptyFacetVocabulary();
    for (const [field, slugs] of slugsByField) vocabulary[field] = [...slugs];
    return vocabulary;
  },

  /**
   * Facet counts for the Postgres path, so the fallback answers with the same distribution
   * the Typesense path does (Design Invariant 1) instead of an empty map.
   *
   * One round trip: a `visible` CTE materialises the filtered, publicly visible projects
   * once, then each facet aggregates over it. The two multi-valued facets need a join
   * (`roomSlugs`, via project_room → taxonomy) or an unnest (`themes`, over the jsonb array
   * on ready images), hence `count(distinct)` — a project with three bedrooms is still one
   * project. Counts are sparse; `denseFacetDistribution` fills in the zeroes.
   */
  async countFeedFacets(filters: DiscoveryFeedFilters): Promise<FacetDistribution> {
    const result = await db.execute<{ field: string; value: string | null; count: number }>(sql`
      with visible as (
        select
          ${schema.project.id} as id,
          ${schema.project.citySlug} as city_slug,
          ${schema.project.localitySlug} as locality_slug,
          ${schema.project.propertyTypeSlug} as property_type_slug,
          ${schema.project.propertySubtypeSlug} as property_subtype_slug,
          ${schema.project.scopeSlug} as scope_slug,
          ${schema.project.bhkSlug} as bhk_slug,
          ${schema.project.budgetBandSlug} as budget_band_slug
        from ${schema.project}
        inner join ${schema.designerProfile}
          on ${eq(schema.project.designerId, schema.designerProfile.id)}
        where ${feedVisibilityWhere(filters)}
      )
      select 'citySlug' as field, city_slug as value, count(*)::int as count
        from visible where city_slug is not null group by city_slug
      union all
      select 'localitySlug', locality_slug, count(*)::int
        from visible where locality_slug is not null group by locality_slug
      union all
      select 'propertyTypeSlug', property_type_slug, count(*)::int
        from visible where property_type_slug is not null group by property_type_slug
      union all
      select 'propertySubtypeSlug', property_subtype_slug, count(*)::int
        from visible where property_subtype_slug is not null group by property_subtype_slug
      union all
      select 'scopeSlug', scope_slug, count(*)::int
        from visible where scope_slug is not null group by scope_slug
      union all
      select 'bhkSlug', bhk_slug, count(*)::int
        from visible where bhk_slug is not null group by bhk_slug
      union all
      select 'budgetBandSlug', budget_band_slug, count(*)::int
        from visible where budget_band_slug is not null group by budget_band_slug
      union all
      select 'roomSlugs', room_type.slug, count(distinct visible.id)::int
        from visible
        inner join ${schema.projectRoom} on ${schema.projectRoom.projectId} = visible.id
        inner join ${schema.taxonomy} as room_type
          on room_type.id = ${schema.projectRoom.roomTypeId} and room_type.kind = 'room'
        group by room_type.slug
      union all
      select 'themes', theme.slug, count(distinct visible.id)::int
        from visible
        inner join ${schema.projectImage} on ${schema.projectImage.projectId} = visible.id
          and ${schema.projectImage.status} = 'ready'
        cross join lateral jsonb_array_elements_text(${schema.projectImage.themeSlugs}) as theme(slug)
        group by theme.slug
    `);

    const distribution: FacetDistribution = {};
    for (const row of result.rows) {
      if (row.value === null) continue;
      (distribution[row.field] ??= {})[row.value] = row.count;
    }
    return distribution;
  },
};

function extractFacetDistribution(
  facetCounts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>,
): FacetDistribution {
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
