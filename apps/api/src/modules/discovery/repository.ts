import { alias } from 'drizzle-orm/pg-core';
import { db, schema, eq, and, inArray, desc, sql } from '@repo/db';
import type { DiscoveryFeedRow, DiscoveryFilters, DiscoverySort } from './types.js';

/**
 * Discovery data-access layer (E-267).
 *
 * Thin repository for the PostgreSQL fallback path. Contains only SQL queries —
 * no business logic, no URL generation, no DTO mapping, no taxonomy resolution.
 *
 * Filters use parameterized `inArray()` for slug-column filters (no string-built SQL).
 * JSONB array filters (themes, materials, finishes) use PostgreSQL's `?|` operator
 * via correlated EXISTS subqueries. Room slug filters use an EXISTS join through
 * project_room → taxonomy.
 *
 * OR within a filter key is handled by `IN (...)` or `?|` (any overlap).
 * AND across filter keys is handled by combining conditions with `and()`.
 */

type ListFeedParams = {
  filters: DiscoveryFilters;
  sort: DiscoverySort;
  limit: number;
  offset: number;
};

export const discoveryRepository = {
  /**
   * Fallback feed query: published projects with active designers, filtered and sorted.
   *
   * Accepts `limit + 1` from the caller to support the `hasMore` pattern.
   * Returns flat `DiscoveryFeedRow` records — the service handles all mapping.
   *
   * Joins:
   * - project → designer_profile (INNER: designer name, rating, review count)
   * - project → organization (INNER via designer_profile.org_id: org slug for designerSlug)
   * - project → project_image (LEFT: cover image status/derivatives/dimensions)
   *
   * Image-level filters (themes, materials, finishes) use EXISTS subqueries
   * against project_image JSONB columns. Room filters use EXISTS through
   * project_room → taxonomy.
   */
  async listFeed(params: ListFeedParams): Promise<DiscoveryFeedRow[]> {
    const { filters, sort, limit, offset } = params;
    const cover = alias(schema.projectImage, 'cover');

    // Base conditions: published + active designer
    const conditions: ReturnType<typeof eq>[] = [
      eq(schema.project.status, 'published'),
      eq(schema.designerProfile.status, 'active'),
    ];

    // --- Slug-column filters (direct WHERE on project table) ---

    if (filters.citySlug?.length) {
      conditions.push(inArray(schema.project.citySlug, filters.citySlug));
    }
    if (filters.localitySlug?.length) {
      conditions.push(inArray(schema.project.localitySlug, filters.localitySlug));
    }
    if (filters.bhkSlug?.length) {
      conditions.push(inArray(schema.project.bhkSlug, filters.bhkSlug));
    }
    if (filters.budgetBandSlug?.length) {
      conditions.push(inArray(schema.project.budgetBandSlug, filters.budgetBandSlug));
    }
    if (filters.scopeSlug?.length) {
      conditions.push(inArray(schema.project.scopeSlug, filters.scopeSlug));
    }
    if (filters.propertySubtypeSlug?.length) {
      conditions.push(inArray(schema.project.propertySubtypeSlug, filters.propertySubtypeSlug));
    }
    if (filters.propertyTypeSlug?.length) {
      conditions.push(inArray(schema.project.propertyTypeSlug, filters.propertyTypeSlug));
    }

    // --- JSONB array filters (EXISTS subquery against project_image) ---
    // Uses PostgreSQL's ?| operator: "does the JSONB array contain any of these values?"

    if (filters.themes?.length) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM project_image pi
          WHERE pi.project_id = ${schema.project.id}
            AND pi.theme_slugs ?| ${sql.raw(`ARRAY[${filters.themes.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}]`)}
        )`,
      );
    }
    if (filters.materials?.length) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM project_image pi
          WHERE pi.project_id = ${schema.project.id}
            AND pi.material_slugs ?| ${sql.raw(`ARRAY[${filters.materials.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}]`)}
        )`,
      );
    }
    if (filters.finishes?.length) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM project_image pi
          WHERE pi.project_id = ${schema.project.id}
            AND pi.finish_slugs ?| ${sql.raw(`ARRAY[${filters.finishes.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')}]`)}
        )`,
      );
    }

    // --- Room slug filter (EXISTS through project_room → taxonomy) ---

    if (filters.roomSlugs?.length) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM project_room pr
          JOIN taxonomy t ON pr.room_type_id = t.id
          WHERE pr.project_id = ${schema.project.id}
            AND t.slug IN (${sql.join(filters.roomSlugs.map((v) => sql`${v}`), sql`, `)})
        )`,
      );
    }

    // Sort ordering
    const orderBy =
      sort === 'featured'
        ? [
            sql`${schema.project.featuredAt} desc nulls last`,
            sql`${schema.project.publishedAt} desc nulls last`,
            desc(schema.project.id),
          ]
        : [
            sql`${schema.project.publishedAt} desc nulls last`,
            desc(schema.project.createdAt),
            desc(schema.project.id),
          ];

    return db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        designerId: schema.project.designerId,
        designerName: schema.designerProfile.displayName,
        designerSlug: schema.organization.slug,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        bhkSlug: schema.project.bhkSlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        scopeSlug: schema.project.scopeSlug,
        propertySubtypeSlug: schema.project.propertySubtypeSlug,
        rating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
        coverStatus: cover.status,
        coverDerivatives: cover.derivatives,
        coverWidth: cover.width,
        coverHeight: cover.height,
        publishedAt: schema.project.publishedAt,
        featuredAt: schema.project.featuredAt,
      })
      .from(schema.project)
      .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
      .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
      .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);
  },

  /**
   * Batch-lookup designer rating and review count by designer ID.
   * Used to enrich Meilisearch results (which don't carry designer stats).
   * Returns a Map keyed by designer_profile.id.
   */
  async findDesignerStats(
    designerIds: string[],
  ): Promise<Map<string, { rating: string; reviewCount: number }>> {
    if (designerIds.length === 0) return new Map();
    const unique = [...new Set(designerIds)];
    const rows = await db
      .select({
        id: schema.designerProfile.id,
        rating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
      })
      .from(schema.designerProfile)
      .where(inArray(schema.designerProfile.id, unique));
    return new Map(rows.map((r) => [r.id, { rating: r.rating, reviewCount: r.reviewCount }]));
  },
};
