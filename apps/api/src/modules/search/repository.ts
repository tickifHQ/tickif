import { projectsIndex, designersIndex, searchClient } from '@repo/search';
import type { ProjectSearchDocument, DesignerSearchDocument } from '@repo/search';
import { db, schema, eq, and } from '@repo/db';
import { desc } from 'drizzle-orm';

/**
 * Search data-access layer (E-261).
 *
 * Thin wrapper over Meilisearch and Postgres. Contains no business logic —
 * filter construction, fallback orchestration, and response mapping live in
 * the service layer. This layer only executes queries.
 */

// ---------------------------------------------------------------------------
// Types (internal to the repository)
// ---------------------------------------------------------------------------

export type MeiliSearchParams = {
  query: string;
  filter: string;
  sort: string[];
  offset: number;
  limit: number;
  facets?: string[];
};

export type MeiliSearchResult<T> = {
  hits: T[];
  estimatedTotalHits: number;
  processingTimeMs: number;
  facetDistribution: Record<string, Record<string, number>> | null;
};

export type MultiSearchSuggestResult = {
  projects: ProjectSearchDocument[];
  designers: DesignerSearchDocument[];
  processingTimeMs: number;
};

export type RecentProjectRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  designerId: string;
  citySlug: string | null;
  publishedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Meilisearch queries
// ---------------------------------------------------------------------------

export const searchRepository = {
  /**
   * Search projects index. Receives pre-built filter string and sort array.
   */
  async searchProjects(params: MeiliSearchParams): Promise<MeiliSearchResult<ProjectSearchDocument>> {
    const index = projectsIndex();
    const result = await index.search(params.query, {
      filter: params.filter || undefined,
      sort: params.sort.length > 0 ? params.sort : undefined,
      offset: params.offset,
      limit: params.limit,
      facets: params.facets,
    });

    return {
      hits: result.hits,
      estimatedTotalHits: result.estimatedTotalHits ?? 0,
      processingTimeMs: result.processingTimeMs ?? 0,
      facetDistribution: result.facetDistribution ?? null,
    };
  },

  /**
   * Search designers index. Receives pre-built filter string and sort array.
   */
  async searchDesigners(params: MeiliSearchParams): Promise<MeiliSearchResult<DesignerSearchDocument>> {
    const index = designersIndex();
    const result = await index.search(params.query, {
      filter: params.filter || undefined,
      sort: params.sort.length > 0 ? params.sort : undefined,
      offset: params.offset,
      limit: params.limit,
      facets: params.facets,
    });

    return {
      hits: result.hits,
      estimatedTotalHits: result.estimatedTotalHits ?? 0,
      processingTimeMs: result.processingTimeMs ?? 0,
      facetDistribution: result.facetDistribution ?? null,
    };
  },

  /**
   * Blended suggest: multiSearch across projects + designers indexes.
   * Retrieves minimal fields for autocomplete display.
   */
  async multiSearchSuggest(
    query: string,
    projectLimit: number,
    designerLimit: number,
  ): Promise<MultiSearchSuggestResult> {
    const client = searchClient();
    const result = await client.multiSearch({
      queries: [
        {
          indexUid: projectsIndex().uid,
          q: query,
          limit: projectLimit,
          attributesToRetrieve: ['id', 'slug', 'title', 'designerName', 'citySlug', 'coverImageKey'],
        },
        {
          indexUid: designersIndex().uid,
          q: query,
          limit: designerLimit,
          attributesToRetrieve: ['id', 'slug', 'displayName', 'citySlugs', 'logoImageKey', 'projectCount'],
        },
      ],
    });

    const [projectResults, designerResults] = result.results;
    const totalMs = Math.max(
      projectResults?.processingTimeMs ?? 0,
      designerResults?.processingTimeMs ?? 0,
    );

    return {
      projects: (projectResults?.hits ?? []) as ProjectSearchDocument[],
      designers: (designerResults?.hits ?? []) as DesignerSearchDocument[],
      processingTimeMs: totalMs,
    };
  },

  // ---------------------------------------------------------------------------
  // Postgres fallback
  // ---------------------------------------------------------------------------

  /**
   * Fallback: latest published projects in a given city.
   * Used when Meilisearch returns zero results after exhausting the fallback ladder.
   */
  async recentPublishedInCity(
    citySlug: string | null,
    limit: number,
  ): Promise<RecentProjectRow[]> {
    const baseQuery = db
      .select({
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        description: schema.project.description,
        designerId: schema.project.designerId,
        citySlug: schema.project.citySlug,
        publishedAt: schema.project.publishedAt,
      })
      .from(schema.project);

    const filtered = citySlug
      ? baseQuery.where(and(eq(schema.project.status, 'published'), eq(schema.project.citySlug, citySlug)))
      : baseQuery.where(eq(schema.project.status, 'published'));

    return filtered
      .orderBy(desc(schema.project.publishedAt))
      .limit(limit);
  },
};
