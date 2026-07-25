import type {
  Derivative,
  DiscoveryFeedQuery,
  DiscoveryFeedCard,
  DiscoveryFeedResponse,
} from '@repo/contracts';
import type { ProjectSearchDocument } from '@repo/search';
import { searchClient } from '@repo/search';
import { presignDownload } from '@repo/storage';
import { searchRepository } from '../search/repository.js';
import { buildFilterExpression } from '../search/query-builder.js';
import { pageToOffset } from '../search/pagination.js';
import { ALLOWED_PROJECT_FACET_KEYS } from '../search/constants.js';
import { projectsRepository } from '../projects/repository.js';
import { discoveryRepository } from './repository.js';
import type { DiscoveryIntermediateModel, DiscoveryFilters, DiscoverySort } from './types.js';

/**
 * Discovery service (E-267).
 *
 * Single orchestration layer — owns:
 * - Backend selection (Meilisearch vs PostgreSQL)
 * - Infrastructure-only fallback logic (Req 16)
 * - Normalization to shared intermediate model
 * - Taxonomy label resolution (batched)
 * - Locality label resolution (batched)
 * - Cover URL signing (parallel)
 * - DTO mapping via single toFeedCard()
 * - Source field assignment
 * - Structured fallback logging
 *
 * Does NOT own: HTTP concerns (Hono), SQL queries (Drizzle), cache headers.
 */

// ---------------------------------------------------------------------------
// Filter extraction
// ---------------------------------------------------------------------------

function extractFilters(query: DiscoveryFeedQuery): DiscoveryFilters {
  const filters: DiscoveryFilters = {};
  for (const key of ALLOWED_PROJECT_FACET_KEYS) {
    const values = query[key as keyof DiscoveryFeedQuery] as string[] | undefined;
    if (values && values.length > 0) {
      filters[key] = values;
    }
  }
  return filters;
}

// ---------------------------------------------------------------------------
// Sort mapping
// ---------------------------------------------------------------------------

function mapSort(sort: DiscoverySort): string[] {
  if (sort === 'featured') return ['featuredAt:desc', 'publishedAt:desc'];
  return ['publishedAt:desc'];
}

// ---------------------------------------------------------------------------
// Normalization: Meilisearch → intermediate model
// ---------------------------------------------------------------------------

function normalizeMeiliHits(hits: ProjectSearchDocument[]): DiscoveryIntermediateModel[] {
  return hits.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    designerId: doc.designerId,
    designerName: doc.designerName,
    designerSlug: doc.designerSlug,
    citySlug: doc.citySlug,
    localitySlug: doc.localitySlug,
    bhkSlug: doc.bhkSlug,
    budgetBandSlug: doc.budgetBandSlug,
    scopeSlug: doc.scopeSlug,
    propertySubtypeSlug: doc.propertySubtypeSlug,
    rating: 0, // Populated after batch designer stats lookup
    reviewCount: 0, // Populated after batch designer stats lookup
    coverImageKey: doc.coverImageKey,
    coverDerivatives: null, // Meili stores the key, not the derivatives array
    coverStatus: doc.coverImageKey ? 'ready' : null,
    coverWidth: null,
    coverHeight: null,
  }));
}

// ---------------------------------------------------------------------------
// Normalization: PostgreSQL → intermediate model
// ---------------------------------------------------------------------------

function normalizeDbRows(
  rows: Awaited<ReturnType<typeof discoveryRepository.listFeed>>,
): DiscoveryIntermediateModel[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    designerId: row.designerId,
    designerName: row.designerName,
    designerSlug: row.designerSlug,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    bhkSlug: row.bhkSlug,
    budgetBandSlug: row.budgetBandSlug,
    scopeSlug: row.scopeSlug,
    propertySubtypeSlug: row.propertySubtypeSlug,
    rating: Number(row.rating) || 0,
    reviewCount: row.reviewCount,
    coverImageKey: null, // DB path uses derivatives array directly
    coverDerivatives: row.coverDerivatives,
    coverStatus: row.coverStatus,
    coverWidth: row.coverWidth,
    coverHeight: row.coverHeight,
  }));
}

// ---------------------------------------------------------------------------
// Derivative selection (fixes phase-1 low-res card bug)
// ---------------------------------------------------------------------------

/**
 * Pick the best derivative for feed card display.
 * Priority: medium+webp → medium → thumb+webp → thumb → first → null.
 * Prefers `medium` over `thumb` to fix the phase-1 low-res-card bug (Req 9).
 */
function pickCardDerivative(derivatives: Derivative[] | null): Derivative | null {
  if (!derivatives || derivatives.length === 0) return null;
  return (
    derivatives.find((d) => d.variant === 'medium' && d.format === 'webp') ??
    derivatives.find((d) => d.variant === 'medium') ??
    derivatives.find((d) => d.variant === 'thumb' && d.format === 'webp') ??
    derivatives.find((d) => d.variant === 'thumb') ??
    derivatives[0] ??
    null
  );
}

// ---------------------------------------------------------------------------
// Single response mapper (Req 8 — both paths use this)
// ---------------------------------------------------------------------------

function toFeedCard(
  item: DiscoveryIntermediateModel,
  labels: Map<string, string>,
  localityLabels: Map<string, string>,
  coverUrl: string | null,
  derivative: Derivative | null,
): DiscoveryFeedCard {
  const labelOf = (kind: string, slug: string | null) =>
    slug ? labels.get(`${kind}:${slug}`) ?? null : null;

  return {
    slug: item.slug,
    title: item.title,
    coverImageUrl: coverUrl,
    imageWidth: derivative?.width ?? null,
    imageHeight: derivative?.height ?? null,
    designerName: item.designerName,
    designerSlug: item.designerSlug,
    city: labelOf('city', item.citySlug),
    locality:
      item.citySlug && item.localitySlug
        ? localityLabels.get(`${item.citySlug}:${item.localitySlug}`) ?? null
        : null,
    bhk: labelOf('bhk', item.bhkSlug),
    rating: item.rating,
    reviewCount: item.reviewCount,
    budget: labelOf('budget_band', item.budgetBandSlug),
    tags: [
      labelOf('bhk', item.bhkSlug),
      labelOf('scope', item.scopeSlug) ?? labelOf('property_subtype', item.propertySubtypeSlug),
    ].filter((t): t is string => !!t),
  };
}

// ---------------------------------------------------------------------------
// Infrastructure error classification (Req 16)
// ---------------------------------------------------------------------------

/**
 * Returns true ONLY for infrastructure failures (connection, timeout, unconfigured).
 * Returns false for programming errors, API errors, validation — those must propagate.
 */
function isInfrastructureError(error: unknown): boolean {
  if (error instanceof Error) {
    const name = error.name;
    const message = error.message.toLowerCase();
    // Meilisearch SDK: MeiliSearchCommunicationError for network issues
    if (name === 'MeiliSearchCommunicationError') return true;
    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) return true;
    // Network-level errors
    if (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('ehostunreach') ||
      message.includes('fetch failed')
    ) return true;
  }
  return false;
}

function classifyError(error: unknown): 'connection_error' | 'timeout' | 'unconfigured' {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  }
  return 'connection_error';
}

// ---------------------------------------------------------------------------
// Structured logging (fire-and-forget, Req 11)
// ---------------------------------------------------------------------------

type FallbackLog = {
  type: 'discovery.fallback_activated';
  reason: 'connection_error' | 'timeout' | 'unconfigured';
  filters: DiscoveryFilters;
  sort: string;
  timestamp: string;
};

function logFallbackActivation(data: Omit<FallbackLog, 'type' | 'timestamp'>): void {
  try {
    const event: FallbackLog = { type: 'discovery.fallback_activated', ...data, timestamp: new Date().toISOString() };
    console.info(JSON.stringify(event));
  } catch {
    // Fire-and-forget — never propagate to caller
  }
}

function logFallbackFailed(reason: string): void {
  try {
    console.info(JSON.stringify({
      type: 'discovery.fallback_failed',
      reason,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    // Fire-and-forget
  }
}

// ---------------------------------------------------------------------------
// Meilisearch availability check
// ---------------------------------------------------------------------------

function isMeiliUnconfigured(): boolean {
  try {
    searchClient();
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const discoveryService = {
  /**
   * Public discovery feed with Meilisearch-first execution and automatic
   * PostgreSQL fallback on infrastructure failure.
   *
   * Algorithm:
   * 1. Extract filters, build sort, compute offset
   * 2. Try Meilisearch (infrastructure errors only trigger fallback)
   * 3. Compute hasMore, trim results
   * 4. Batch taxonomy + locality resolution (parallel)
   * 5. Parallel cover URL signing
   * 6. Map to Feed_Card[] via single toFeedCard()
   * 7. Return response with source field
   */
  async feed(query: DiscoveryFeedQuery): Promise<DiscoveryFeedResponse> {
    const sort = query.sort as DiscoverySort;
    const filters = extractFilters(query);
    const sortArray = mapSort(sort);
    const { offset, limit } = pageToOffset(query.page, query.limit);

    let intermediateResults: DiscoveryIntermediateModel[];
    let source: 'search' | 'db';

    // --- Provider selection (Req 16: only infrastructure failures trigger fallback) ---

    if (isMeiliUnconfigured()) {
      logFallbackActivation({ reason: 'unconfigured', filters, sort });
      intermediateResults = await postgresPath(filters, sort, limit, offset);
      source = 'db';
    } else {
      try {
        const result = await searchRepository.searchProjects({
          query: '',
          filter: buildFilterExpression(filters),
          sort: sortArray,
          offset,
          limit: limit + 1,
        });
        intermediateResults = normalizeMeiliHits(result.hits);
        source = 'search';
      } catch (error: unknown) {
        // ONLY infrastructure failures trigger fallback
        if (!isInfrastructureError(error)) {
          throw error; // Programming errors, API errors → 500
        }
        const reason = classifyError(error);
        logFallbackActivation({ reason, filters, sort });
        intermediateResults = await postgresPath(filters, sort, limit, offset);
        source = 'db';
      }
    }

    // --- Compute hasMore and trim ---
    const hasMore = intermediateResults.length > limit;
    const pageItems = hasMore ? intermediateResults.slice(0, limit) : intermediateResults;

    // --- Enrich Meili results with designer stats (Req 8: contract equality) ---
    // The DB path already has rating/reviewCount from the JOIN.
    // The Meili path doesn't carry designer stats, so we batch-lookup them.
    if (source === 'search') {
      const designerIds = [...new Set(pageItems.map((item) => item.designerId).filter(Boolean))];
      if (designerIds.length > 0) {
        const statsMap = await discoveryRepository.findDesignerStats(designerIds);
        for (const item of pageItems) {
          const stats = statsMap.get(item.designerId);
          if (stats) {
            item.rating = Number(stats.rating) || 0;
            item.reviewCount = stats.reviewCount;
          }
        }
      }
    }

    // --- Batch taxonomy + locality resolution (parallel, Req 14) ---
    const taxonomyPairs = pageItems.flatMap((item) => {
      const pairs: { kind: string; slug: string }[] = [];
      if (item.citySlug) pairs.push({ kind: 'city', slug: item.citySlug });
      if (item.bhkSlug) pairs.push({ kind: 'bhk', slug: item.bhkSlug });
      if (item.budgetBandSlug) pairs.push({ kind: 'budget_band', slug: item.budgetBandSlug });
      if (item.scopeSlug) pairs.push({ kind: 'scope', slug: item.scopeSlug });
      if (item.propertySubtypeSlug) pairs.push({ kind: 'property_subtype', slug: item.propertySubtypeSlug });
      return pairs;
    });

    const localityPairs = pageItems
      .filter((item) => item.citySlug && item.localitySlug)
      .map((item) => ({ citySlug: item.citySlug!, localitySlug: item.localitySlug! }));

    const [labels, localityLabels] = await Promise.all([
      projectsRepository.findTaxonomyLabels(taxonomyPairs as { kind: Parameters<typeof projectsRepository.findTaxonomyLabels>[0][0]['kind']; slug: string }[]),
      projectsRepository.findLocalityLabels(localityPairs),
    ]);

    // --- Parallel cover URL signing (Req 14) ---
    const derivatives = pageItems.map((item) => {
      if (item.coverStatus !== 'ready') return null;
      return pickCardDerivative(item.coverDerivatives);
    });

    const coverUrls = await Promise.all(
      pageItems.map((item, i) => {
        const derivative = derivatives[i];
        if (!derivative) {
          // For Meili path: use coverImageKey directly
          if (item.coverImageKey) {
            return presignDownload({ key: item.coverImageKey }).catch(() => null);
          }
          return Promise.resolve(null);
        }
        return presignDownload({ key: derivative.key }).catch(() => null);
      }),
    );

    // --- Map to Feed_Card[] (single mapper, Req 8) ---
    const items: DiscoveryFeedCard[] = pageItems.map((item, i) =>
      toFeedCard(item, labels, localityLabels, coverUrls[i] ?? null, derivatives[i] ?? null),
    );

    return { items, page: query.page, limit: query.limit, hasMore, source };
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL fallback path (called by the provider selection logic)
// ---------------------------------------------------------------------------

async function postgresPath(
  filters: DiscoveryFilters,
  sort: DiscoverySort,
  limit: number,
  offset: number,
): Promise<DiscoveryIntermediateModel[]> {
  try {
    const rows = await discoveryRepository.listFeed({
      filters,
      sort,
      limit: limit + 1,
      offset,
    });
    return normalizeDbRows(rows);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : 'unknown';
    logFallbackFailed(reason);
    return [];
  }
}
