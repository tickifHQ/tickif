/**
 * Search repository — the ONLY layer that knows about Typesense.
 *
 * Responsibilities:
 * - Execute Typesense queries via @repo/search client
 * - Execute Postgres fallback queries via @repo/db
 * - Return domain types (not raw Typesense responses)
 */
import {
  searchClient,
  searchCollectionName,
  PROJECT_QUERY_BY,
  DESIGNER_QUERY_BY,
  PROJECT_DEFAULT_SORT,
  DESIGNER_DEFAULT_SORT,
  designerDefaultSort,
  discoveryRanking,
  searchWithDiscoveryFallback,
  type ProjectSearchDocument,
  type DesignerSearchDocument,
} from '@repo/search';
import { db, schema, eq, and, asc, desc, gt, isNotNull, isNull, inArray, or, sql } from '@repo/db';
import { exists, ilike } from 'drizzle-orm';
import type { Derivative } from '@repo/contracts';
import {
  PROJECT_FACET_FIELDS,
  PROJECT_MAX_FACET_VALUES,
  DESIGNER_FACET_FIELDS,
  PROJECT_SUGGEST_FIELDS,
  DESIGNER_SUGGEST_FIELDS,
} from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Domain Types (repository returns these, not raw Typesense SearchResponse)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectSearchResult {
  hits: ProjectSearchDocument[];
  estimatedTotalHits: number;
  facetDistribution: Record<string, Record<string, number>>;
  processingTimeMs: number;
}

export async function insertSearchActivity(input: {
  actorUserId: string | null;
  endpoint: 'projects' | 'designers';
  query: string;
}): Promise<void> {
  const query = input.query.trim();
  const actorUserId = input.actorUserId;
  if (!actorUserId || !query) return;
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.searchActivity).values({ ...input, actorUserId, query });
      await tx.execute(sql`
        delete from ${schema.searchActivity}
        where ${schema.searchActivity.actorUserId} = ${actorUserId}
          and (
            ${schema.searchActivity.createdAt} < now() - interval '180 days'
            or ${schema.searchActivity.id} in (
              select ${schema.searchActivity.id}
              from ${schema.searchActivity}
              where ${schema.searchActivity.actorUserId} = ${actorUserId}
              order by ${schema.searchActivity.createdAt} desc, ${schema.searchActivity.id} desc
              offset 1000
            )
          )
      `);
    });
  } catch (error) {
    console.error('[search] Failed to record authenticated search activity:', error);
  }
}

export interface DesignerSearchResult {
  hits: DesignerSearchDocument[];
  estimatedTotalHits: number;
  facetDistribution: Record<string, Record<string, number>>;
  processingTimeMs: number;
}

export interface MultiSearchResult {
  projects: ProjectSearchDocument[];
  designers: DesignerSearchDocument[];
  processingTimeMs: number;
}

export interface FilterSuggestion {
  kind: 'style' | 'space' | 'material' | 'tag';
  filterKey: 'theme' | 'room' | 'material' | 'tag';
  slug: string;
  label: string;
}

export interface RecentProject {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  designerId: string;
  designerSlug: string | null;
  designerName: string;
  citySlug: string | null;
  cityName: string | null;
  localitySlug: string | null;
  propertyTypeSlug: string | null;
  propertySubtypeSlug: string | null;
  scopeSlug: string | null;
  bhkSlug: string | null;
  budgetBandSlug: string | null;
  sizeSqft: number | null;
  themes: string[];
  materials: string[];
  finishes: string[];
  roomSlugs: string[];
  coverImageKey: string | null;
  publishedAt: Date;
}

export type GoogleRatingAggregate = {
  rating: number;
  ratingCount: number;
};

const GOOGLE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Typesense Search Parameters
// ─────────────────────────────────────────────────────────────────────────────

export interface TypesenseSearchParams {
  q: string;
  query_by: string;
  filter_by?: string;
  sort_by?: string;
  facet_by?: string;
  include_fields?: string;
  page: number;
  per_page: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cover-derivative policy for the Postgres fallback.
 *
 * Deliberately identical to `pickCoverDerivative` in apps/worker/src/search/mapper.ts,
 * which produces `coverImageKey` for the Typesense document. Keeping the two in step
 * means a fallback hit and an indexed hit render the same image. The worker helper is
 * not importable from apps/api, so the policy is duplicated rather than shared —
 * change both together.
 */
function pickCoverDerivativeKey(derivatives: Derivative[] | null): string | null {
  if (!derivatives) return null;
  return (
    derivatives.find(
      (derivative) => derivative.variant === 'medium' && derivative.format === 'webp',
    )?.key ??
    derivatives.find((derivative) => derivative.variant === 'medium')?.key ??
    derivatives.find((derivative) => derivative.variant === 'large' && derivative.format === 'webp')
      ?.key ??
    derivatives.find((derivative) => derivative.variant === 'large')?.key ??
    derivatives.find((derivative) => derivative.variant === 'small' && derivative.format === 'webp')
      ?.key ??
    derivatives.find((derivative) => derivative.variant === 'small')?.key ??
    derivatives.find((derivative) => derivative.variant === 'thumb' && derivative.format === 'webp')
      ?.key ??
    derivatives.find((derivative) => derivative.variant === 'thumb')?.key ??
    derivatives[0]?.key ??
    null
  );
}

/**
 * Transform Typesense facet_counts to domain facetDistribution shape.
 */
function extractFacetDistribution(
  facetCounts?: Array<{
    field_name: string;
    counts: Array<{ value: string; count: number }>;
  }>,
): Record<string, Record<string, number>> {
  if (!facetCounts) return {};
  const result: Record<string, Record<string, number>> = {};
  for (const facet of facetCounts) {
    const facetValues: Record<string, number> = {};
    for (const { value, count } of facet.counts) {
      facetValues[value] = count;
    }
    result[facet.field_name] = facetValues;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search projects in Typesense.
 * Returns domain type ProjectSearchResult, not raw Typesense SearchResponse.
 */
export async function searchProjects(params: TypesenseSearchParams): Promise<ProjectSearchResult> {
  const client = searchClient();
  const collectionName = searchCollectionName('projects');

  const searchParams = {
    q: params.q,
    query_by: params.query_by || PROJECT_QUERY_BY.join(','),
    filter_by: params.filter_by,
    sort_by: params.sort_by || discoveryRanking(),
    facet_by: params.facet_by || PROJECT_FACET_FIELDS.join(','),
    max_facet_values: PROJECT_MAX_FACET_VALUES,
    include_fields: params.include_fields,
    page: params.page,
    per_page: params.per_page,
  };

  const documents = client.collections<ProjectSearchDocument>(collectionName).documents();
  const canUseLegacyFacetSchema = !searchParams.filter_by?.includes('tags:=');
  const legacySearchParams = canUseLegacyFacetSchema
    ? {
        ...searchParams,
        sort_by: params.sort_by || PROJECT_DEFAULT_SORT,
        facet_by: PROJECT_FACET_FIELDS.filter((field) => field !== 'tags').join(','),
      }
    : { ...searchParams, sort_by: params.sort_by || PROJECT_DEFAULT_SORT };
  const result = await searchWithDiscoveryFallback(
    (query) => documents.search(query),
    searchParams,
    legacySearchParams,
  );

  return {
    hits: (result.hits ?? []).map((hit: { document: ProjectSearchDocument }) => hit.document),
    estimatedTotalHits: result.found ?? 0,
    facetDistribution: extractFacetDistribution(result.facet_counts),
    processingTimeMs: result.search_time_ms ?? 0,
  };
}

/**
 * Search designers in Typesense.
 * Returns domain type DesignerSearchResult, not raw Typesense SearchResponse.
 */
export async function searchDesigners(
  params: TypesenseSearchParams,
): Promise<DesignerSearchResult> {
  const client = searchClient();
  const collectionName = searchCollectionName('designers');

  const searchParams = {
    q: params.q,
    query_by: params.query_by || DESIGNER_QUERY_BY.join(','),
    filter_by: params.filter_by,
    sort_by:
      params.sort_by === 'avgRating:desc'
        ? discoveryRanking(Date.now(), true)
        : params.sort_by || designerDefaultSort(),
    facet_by: params.facet_by || DESIGNER_FACET_FIELDS.join(','),
    include_fields: params.include_fields,
    page: params.page,
    per_page: params.per_page,
  };

  const documents = client.collections<DesignerSearchDocument>(collectionName).documents();
  const result = await searchWithDiscoveryFallback(
    (query) => documents.search(query),
    searchParams,
    {
      ...searchParams,
      query_by: searchParams.query_by
        .split(',')
        .filter((field) => field !== 'portfolioTerms')
        .join(','),
      sort_by: params.sort_by || DESIGNER_DEFAULT_SORT,
    },
  );

  return {
    hits: (result.hits ?? []).map((hit: { document: DesignerSearchDocument }) => hit.document),
    estimatedTotalHits: result.found ?? 0,
    facetDistribution: extractFacetDistribution(result.facet_counts),
    processingTimeMs: result.search_time_ms ?? 0,
  };
}

/**
 * Load card-safe Google Business aggregates for one search page in a single query.
 * The same 30-day freshness boundary as the public portfolio read model prevents
 * stale provider data from escaping when a worker refresh is delayed.
 */
export async function findFreshGoogleRatings(
  profileIds: string[],
): Promise<Map<string, GoogleRatingAggregate>> {
  if (profileIds.length === 0) return new Map();

  const rows = await db
    .select({
      profileId: schema.googlePlaceCache.profileId,
      rating: schema.googlePlaceCache.rating,
      ratingCount: schema.googlePlaceCache.userRatingsTotal,
    })
    .from(schema.googlePlaceCache)
    .leftJoin(
      schema.designerPortfolio,
      eq(schema.designerPortfolio.profileId, schema.googlePlaceCache.profileId),
    )
    .where(
      and(
        inArray(schema.googlePlaceCache.profileId, [...new Set(profileIds)]),
        or(
          isNull(schema.designerPortfolio.profileId),
          eq(schema.designerPortfolio.showGoogleOverallRating, true),
        ),
        eq(schema.googlePlaceCache.status, 'connected'),
        isNotNull(schema.googlePlaceCache.rating),
        isNotNull(schema.googlePlaceCache.userRatingsTotal),
        isNotNull(schema.googlePlaceCache.lastFetchedAt),
        gt(schema.googlePlaceCache.lastFetchedAt, new Date(Date.now() - GOOGLE_CACHE_MAX_AGE_MS)),
      ),
    );

  return new Map(
    rows.map((row) => [
      row.profileId,
      { rating: Number(row.rating), ratingCount: row.ratingCount! },
    ]),
  );
}

/**
 * Blended multi-search for suggest (autocomplete).
 * Searches both projects and designers in a single request.
 */
export async function multiSearch(q: string): Promise<MultiSearchResult> {
  const client = searchClient();

  const projectCollectionName = searchCollectionName('projects');
  const designerCollectionName = searchCollectionName('designers');

  const result = await client.multiSearch.perform<[ProjectSearchDocument, DesignerSearchDocument]>(
    {
      searches: [
        {
          collection: projectCollectionName,
          q,
          query_by: PROJECT_QUERY_BY.join(','),
          include_fields: PROJECT_SUGGEST_FIELDS.join(','),
          per_page: 5,
        },
        {
          collection: designerCollectionName,
          q,
          // Suggestions retain the profile-only fields for old-schema compatibility.
          query_by: DESIGNER_QUERY_BY.filter((field) => field !== 'portfolioTerms').join(','),
          include_fields: DESIGNER_SUGGEST_FIELDS.join(','),
          per_page: 3,
        },
      ],
    },
    {},
  );

  const projectResult = result.results[0];
  const designerResult = result.results[1];

  // Calculate total processing time (max of both searches)
  const projectTime = projectResult?.search_time_ms ?? 0;
  const designerTime = designerResult?.search_time_ms ?? 0;
  const processingTimeMs = Math.max(projectTime, designerTime);

  return {
    projects: (projectResult?.hits ?? []).map((hit) => hit.document),
    designers: (designerResult?.hits ?? []).map((hit) => hit.document),
    processingTimeMs,
  };
}

/** Find active taxonomy and live image tags that can be applied as discovery filters. */
export async function findFilterSuggestions(q: string): Promise<FilterSuggestion[]> {
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  const visibleRoom = db
    .select({ id: schema.projectRoom.id })
    .from(schema.projectRoom)
    .innerJoin(schema.project, eq(schema.projectRoom.projectId, schema.project.id))
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .where(
      and(
        eq(schema.projectRoom.roomTypeId, schema.taxonomy.id),
        eq(schema.projectRoom.isLive, true),
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
      ),
    );
  const visibleTheme = db
    .select({ id: schema.projectImage.id })
    .from(schema.projectImage)
    .innerJoin(schema.project, eq(schema.projectImage.projectId, schema.project.id))
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .where(
      and(
        eq(schema.projectImage.status, 'ready'),
        eq(schema.projectImage.isLive, true),
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
        sql`${schema.projectImage.themeSlugs} ? ${schema.taxonomy.slug}`,
      ),
    );
  const visibleMaterial = db
    .select({ id: schema.projectImage.id })
    .from(schema.projectImage)
    .innerJoin(schema.project, eq(schema.projectImage.projectId, schema.project.id))
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .where(
      and(
        eq(schema.projectImage.status, 'ready'),
        eq(schema.projectImage.isLive, true),
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
        sql`${schema.projectImage.materialSlugs} ? ${schema.taxonomy.slug}`,
      ),
    );
  const [terms, tagResult] = await Promise.all([
    db
      .select({ kind: schema.taxonomy.kind, slug: schema.taxonomy.slug, label: schema.taxonomy.label })
      .from(schema.taxonomy)
      .where(
        and(
          eq(schema.taxonomy.isActive, true),
          inArray(schema.taxonomy.kind, ['theme', 'room', 'material']),
          or(ilike(schema.taxonomy.label, pattern), ilike(schema.taxonomy.slug, pattern)),
          or(
            and(eq(schema.taxonomy.kind, 'room'), exists(visibleRoom)),
            and(eq(schema.taxonomy.kind, 'theme'), exists(visibleTheme)),
            and(eq(schema.taxonomy.kind, 'material'), exists(visibleMaterial)),
          ),
        ),
      )
      .orderBy(asc(schema.taxonomy.sortOrder), asc(schema.taxonomy.label))
      .limit(12),
    db.execute<{ slug: string }>(sql`
      select distinct tag.slug
      from ${schema.projectImage}
      inner join ${schema.project}
        on ${eq(schema.projectImage.projectId, schema.project.id)}
      inner join ${schema.designerProfile}
        on ${eq(schema.project.designerId, schema.designerProfile.id)}
      cross join lateral jsonb_array_elements_text(${schema.projectImage.tagSlugs}) as tag(slug)
      where ${schema.projectImage.status} = 'ready'
        and ${schema.projectImage.isLive} = true
        and ${schema.project.status} = 'published'
        and ${schema.designerProfile.status} = 'active'
        and tag.slug ilike ${pattern}
      order by tag.slug
      limit 6
    `),
  ]);

  const kindMap = {
    theme: { kind: 'style', filterKey: 'theme' },
    room: { kind: 'space', filterKey: 'room' },
    material: { kind: 'material', filterKey: 'material' },
  } as const;
  const taxonomySuggestions = terms.flatMap((term) => {
    const mapped = kindMap[term.kind as keyof typeof kindMap];
    return mapped ? [{ ...mapped, slug: term.slug, label: term.label }] : [];
  });
  const tagSuggestions: FilterSuggestion[] = tagResult.rows.map(({ slug }) => ({
    kind: 'tag',
    filterKey: 'tag',
    slug,
    label: slug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
  }));

  return [...taxonomySuggestions, ...tagSuggestions].slice(0, 12);
}

/**
 * Postgres fallback query for recent published projects in a city.
 * Used when Typesense returns zero results after exhausting the fallback ladder.
 */
export async function recentProjectsInCity(
  citySlug: string,
  limit: number,
): Promise<RecentProject[]> {
  // Query base project data with designer join
  const rows = await db
    .select({
      id: schema.project.id,
      slug: schema.project.slug,
      title: schema.project.title,
      description: schema.project.description,
      designerId: schema.project.designerId,
      designerSlug: schema.designerProfile.slug,
      designerName: schema.designerProfile.displayName,
      citySlug: schema.project.citySlug,
      cityName: schema.project.cityName,
      localitySlug: schema.project.localitySlug,
      propertyTypeSlug: schema.project.propertyTypeSlug,
      propertySubtypeSlug: schema.project.propertySubtypeSlug,
      scopeSlug: schema.project.scopeSlug,
      bhkSlug: schema.project.bhkSlug,
      budgetBandSlug: schema.project.budgetBandSlug,
      sizeSqft: schema.project.sizeSqft,
      coverImageId: schema.project.coverImageId,
      publishedAt: schema.project.publishedAt,
    })
    .from(schema.project)
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
    .where(
      and(
        eq(schema.project.status, 'published'),
        eq(schema.project.citySlug, citySlug),
        eq(schema.designerProfile.status, 'active'),
        isNotNull(schema.project.publishedAt),
      ),
    )
    .orderBy(desc(schema.project.publishedAt))
    .limit(limit);

  if (rows.length === 0) {
    return [];
  }

  // Fetch project IDs and cover image IDs for additional data lookups
  const projectIds = rows.map((r) => r.id);
  const coverImageIds = rows.filter((r) => r.coverImageId != null).map((r) => r.coverImageId!);

  // Fetch room slugs and image tags for each project in parallel
  const [roomsData, imagesData, coverData] = await Promise.all([
    // Fetch room slugs per project
    db
      .select({
        projectId: schema.projectRoom.projectId,
        slug: schema.taxonomy.slug,
      })
      .from(schema.projectRoom)
      .innerJoin(schema.taxonomy, eq(schema.projectRoom.roomTypeId, schema.taxonomy.id))
      .where(
        and(inArray(schema.projectRoom.projectId, projectIds), eq(schema.projectRoom.isLive, true)),
      ),

    // Fetch themes, materials, finishes from project images
    db
      .select({
        projectId: schema.projectImage.projectId,
        themeSlugs: schema.projectImage.themeSlugs,
        materialSlugs: schema.projectImage.materialSlugs,
        finishSlugs: schema.projectImage.finishSlugs,
      })
      .from(schema.projectImage)
      .where(
        and(
          inArray(schema.projectImage.projectId, projectIds),
          eq(schema.projectImage.status, 'ready'),
          eq(schema.projectImage.isLive, true),
        ),
      ),

    // Fetch cover image keys for the projects' cover images
    coverImageIds.length > 0
      ? db
          .select({
            id: schema.projectImage.id,
            derivatives: schema.projectImage.derivatives,
          })
          .from(schema.projectImage)
          .where(
            and(
              inArray(schema.projectImage.id, coverImageIds),
              eq(schema.projectImage.status, 'ready'),
              eq(schema.projectImage.isLive, true),
            ),
          )
      : Promise.resolve([]),
  ]);

  // Index rooms by project ID
  const roomsByProject = new Map<string, string[]>();
  for (const room of roomsData) {
    const existing = roomsByProject.get(room.projectId) ?? [];
    existing.push(room.slug);
    roomsByProject.set(room.projectId, existing);
  }

  // Index image tags by project ID (dedupe and aggregate)
  const imageTagsByProject = new Map<
    string,
    { themes: Set<string>; materials: Set<string>; finishes: Set<string> }
  >();
  for (const img of imagesData) {
    let tags = imageTagsByProject.get(img.projectId);
    if (!tags) {
      tags = { themes: new Set(), materials: new Set(), finishes: new Set() };
      imageTagsByProject.set(img.projectId, tags);
    }
    for (const t of img.themeSlugs) tags.themes.add(t);
    for (const m of img.materialSlugs) tags.materials.add(m);
    for (const f of img.finishSlugs) tags.finishes.add(f);
  }

  // Index cover image derivatives by ID
  const coverById = new Map<string, Derivative[]>();
  for (const c of coverData) {
    coverById.set(c.id, c.derivatives);
  }

  // Map rows to RecentProject domain type
  return rows.map((row) => {
    const tags = imageTagsByProject.get(row.id);
    const coverDerivatives = row.coverImageId ? coverById.get(row.coverImageId) : null;
    // Mirror the indexer's cover policy (apps/worker/src/search/mapper.ts →
    // pickCoverDerivative) so a Postgres fallback hit renders the same image the
    // Typesense document would have carried.
    const coverImageKey = pickCoverDerivativeKey(coverDerivatives ?? null);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      designerId: row.designerId,
      designerSlug: row.designerSlug,
      designerName: row.designerName,
      citySlug: row.citySlug,
      cityName: row.cityName,
      localitySlug: row.localitySlug,
      propertyTypeSlug: row.propertyTypeSlug,
      propertySubtypeSlug: row.propertySubtypeSlug,
      scopeSlug: row.scopeSlug,
      bhkSlug: row.bhkSlug,
      budgetBandSlug: row.budgetBandSlug,
      sizeSqft: row.sizeSqft,
      themes: tags ? Array.from(tags.themes) : [],
      materials: tags ? Array.from(tags.materials) : [],
      finishes: tags ? Array.from(tags.finishes) : [],
      roomSlugs: roomsByProject.get(row.id) ?? [],
      coverImageKey,
      publishedAt: row.publishedAt!,
    };
  });
}
