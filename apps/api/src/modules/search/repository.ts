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
  type ProjectSearchDocument,
  type DesignerSearchDocument,
} from '@repo/search';
import { db, schema, eq, and, desc, isNotNull, inArray } from '@repo/db';
import type { Derivative } from '@repo/contracts';
import {
  PROJECT_FACET_FIELDS,
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

export interface RecentProject {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  designerId: string;
  designerSlug: string | null;
  designerName: string;
  citySlug: string | null;
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
      (derivative) => derivative.variant === 'thumb' && derivative.format === 'webp',
    )?.key ??
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

/**
 * A field missing from inside `_eval(...)` does NOT surface as the named "Could not find a
 * field" error. Typesense 30.2 answers `400 Error parsing eval expression in sort_by clause.`,
 * which names neither field — verified against the running 30.2 image with both verification
 * fields absent and with only `kycExpiresAt` absent. The named 404 form only appears for a bare
 * `sort_by=isKycVerified:desc`, which this path never emits; it is kept as a belt-and-braces
 * match in case a future version reports the eval case that way.
 *
 * Matching the generic parse error is safe: the retry is already gated on the verification
 * ranking path and falls back to the static default sort, so the worst case is unranked-but-
 * correct results instead of a 500 on the primary discovery endpoint.
 */
function isMissingVerificationSortField(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes('Error parsing eval expression')) return true;
  return (
    error.message.includes('Could not find a field named') &&
    (error.message.includes('isKycVerified') || error.message.includes('kycExpiresAt'))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search projects in Typesense.
 * Returns domain type ProjectSearchResult, not raw Typesense SearchResponse.
 */
export async function searchProjects(
  params: TypesenseSearchParams,
): Promise<ProjectSearchResult> {
  const client = searchClient();
  const collectionName = searchCollectionName('projects');

  const searchParams = {
    q: params.q,
    query_by: params.query_by || PROJECT_QUERY_BY.join(','),
    filter_by: params.filter_by,
    sort_by: params.sort_by || PROJECT_DEFAULT_SORT,
    facet_by: params.facet_by || PROJECT_FACET_FIELDS.join(','),
    include_fields: params.include_fields,
    page: params.page,
    per_page: params.per_page,
  };

  const result = await client
    .collections<ProjectSearchDocument>(collectionName)
    .documents()
    .search(searchParams);

  return {
    hits: (result.hits ?? []).map(
      (hit: { document: ProjectSearchDocument }) => hit.document,
    ),
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
  const usesVerificationRanking = !params.sort_by;

  const searchParams = {
    q: params.q,
    query_by: params.query_by || DESIGNER_QUERY_BY.join(','),
    filter_by: params.filter_by,
    sort_by: params.sort_by || designerDefaultSort(),
    facet_by: params.facet_by || DESIGNER_FACET_FIELDS.join(','),
    include_fields: params.include_fields,
    page: params.page,
    per_page: params.per_page,
  };

  const documents = client.collections<DesignerSearchDocument>(collectionName).documents();
  let result;
  try {
    result = await documents.search(searchParams);
  } catch (error) {
    if (!usesVerificationRanking || !isMissingVerificationSortField(error)) throw error;
    result = await documents.search({
      ...searchParams,
      sort_by: DESIGNER_DEFAULT_SORT,
    });
  }

  return {
    hits: (result.hits ?? []).map(
      (hit: { document: DesignerSearchDocument }) => hit.document,
    ),
    estimatedTotalHits: result.found ?? 0,
    facetDistribution: extractFacetDistribution(result.facet_counts),
    processingTimeMs: result.search_time_ms ?? 0,
  };
}

/**
 * Blended multi-search for suggest (autocomplete).
 * Searches both projects and designers in a single request.
 */
export async function multiSearch(q: string): Promise<MultiSearchResult> {
  const client = searchClient();

  const projectCollectionName = searchCollectionName('projects');
  const designerCollectionName = searchCollectionName('designers');

  const result = await client.multiSearch.perform<
    [ProjectSearchDocument, DesignerSearchDocument]
  >(
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
          query_by: DESIGNER_QUERY_BY.join(','),
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
      designerSlug: schema.organization.slug,
      designerName: schema.designerProfile.displayName,
      citySlug: schema.project.citySlug,
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
    .innerJoin(
      schema.designerProfile,
      eq(schema.project.designerId, schema.designerProfile.id),
    )
    .innerJoin(
      schema.organization,
      eq(schema.designerProfile.orgId, schema.organization.id),
    )
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
  const coverImageIds = rows
    .filter((r) => r.coverImageId != null)
    .map((r) => r.coverImageId!);

  // Fetch room slugs and image tags for each project in parallel
  const [roomsData, imagesData, coverData] = await Promise.all([
    // Fetch room slugs per project
    db
      .select({
        projectId: schema.projectRoom.projectId,
        slug: schema.taxonomy.slug,
      })
      .from(schema.projectRoom)
      .innerJoin(
        schema.taxonomy,
        eq(schema.projectRoom.roomTypeId, schema.taxonomy.id),
      )
      .where(inArray(schema.projectRoom.projectId, projectIds)),

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
    const coverDerivatives = row.coverImageId
      ? coverById.get(row.coverImageId)
      : null;
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
