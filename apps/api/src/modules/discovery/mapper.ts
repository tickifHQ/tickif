import { presignDownload } from '@repo/storage';
import type { DiscoveryCard, Derivative } from '@repo/contracts';
import type { ProjectSearchDocument } from '@repo/search';
import type { FeedProjectRow } from './repository.js';
import type { TaxonomyKind } from '../projects/repository.js';
import { projectsRepository } from '../projects/repository.js';

/**
 * Discovery feed mapper — the ONLY layer producing DiscoveryCard objects.
 *
 * Design Invariant 1: Both Typesense and Postgres paths MUST use toDiscoveryCard().
 * This ensures contract-identical responses regardless of data source.
 *
 * Flow:
 *   Typesense hit → normalizeTypesenseHit() → NormalizedFeedItem
 *   Postgres row  → normalizePostgresRow()  → NormalizedFeedItem
 *                                                ↓
 *                                        toDiscoveryCard()
 *                                                ↓
 *                                          DiscoveryCard
 */

// ─────────────────────────────────────────────────────────────────────────────
// Intermediate Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized intermediate type that both Typesense and Postgres data
 * is converted to BEFORE mapping to DiscoveryCard.
 *
 * This ensures contract-identical responses regardless of data source.
 */
export interface NormalizedFeedItem {
  slug: string;
  title: string;
  designerName: string;
  designerSlug: string | null;
  citySlug: string | null;
  bhkSlug: string | null;
  avgRating: number;
  reviewCount: number;
  /** For Typesense: the coverImageKey. For Postgres: null (we have derivatives). */
  coverImageKey: string | null;
  /** For Postgres: the cover derivatives. For Typesense: null. */
  coverDerivatives: Derivative[] | null;
  /** For Postgres: the cover status. For Typesense: assumed 'ready' if key exists. */
  coverStatus: 'processing' | 'ready' | 'failed' | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a Typesense hit to intermediate type.
 *
 * @see Requirement 6.1, 6.2 (Contract-Identical Responses)
 */
export function normalizeTypesenseHit(hit: ProjectSearchDocument): NormalizedFeedItem {
  return {
    slug: hit.slug,
    title: hit.title,
    designerName: hit.designerName,
    designerSlug: hit.designerSlug,
    citySlug: hit.citySlug,
    bhkSlug: hit.bhkSlug,
    avgRating: hit.avgRating ?? 0,
    reviewCount: hit.reviewCount ?? 0,
    coverImageKey: hit.coverImageKey,
    coverDerivatives: null,
    coverStatus: hit.coverImageKey ? 'ready' : null,
  };
}

/**
 * Normalize a Postgres row to intermediate type.
 *
 * @see Requirement 6.1, 6.2 (Contract-Identical Responses)
 */
export function normalizePostgresRow(row: FeedProjectRow): NormalizedFeedItem {
  return {
    slug: row.slug,
    title: row.title,
    designerName: row.designerName,
    designerSlug: row.designerSlug,
    citySlug: row.citySlug,
    bhkSlug: row.bhkSlug,
    avgRating: Number(row.avgRating) || 0,
    reviewCount: row.reviewCount,
    coverImageKey: null,
    coverDerivatives: row.coverDerivatives,
    coverStatus: row.coverStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the small (640px) derivative for card display.
 * Prefers WebP format when available.
 * Fixes the phase-1 low-resolution bug by using the correct variant.
 *
 * @see Requirement 7.3, 7.4, 7.5
 */
function pickSmallDerivative(derivatives: Derivative[] | null): Derivative | null {
  if (!derivatives) return null;
  return (
    derivatives.find((d) => d.variant === 'small' && d.format === 'webp') ??
    derivatives.find((d) => d.variant === 'small') ??
    null
  );
}

/**
 * Format rating snippet: "4.8 (12 reviews)" or "4.8 (1 review)" or null.
 *
 * @see Requirement 7.9
 */
function formatRatingSnippet(avgRating: number, reviewCount: number): string | null {
  if (reviewCount === 0) return null;
  const rating = avgRating.toFixed(1);
  const reviews = reviewCount === 1 ? '1 review' : `${reviewCount} reviews`;
  return `${rating} (${reviews})`;
}

/**
 * Resolve taxonomy label from slug.
 * Returns null for null slugs or missing labels.
 */
async function resolveLabel(kind: TaxonomyKind, slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const labels = await projectsRepository.findTaxonomyLabels([{ kind, slug }]);
  return labels.get(`${kind}:${slug}`) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Mapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHARED mapper: transforms normalized item to DiscoveryCard.
 *
 * This is the ONLY function that produces DiscoveryCard objects.
 * Both Typesense and Postgres paths MUST use this function.
 * This enforces the contract-identical response invariant (Design Invariant 1).
 *
 * @see Requirements 6.1, 6.2, 7.1-7.10
 */
export async function toDiscoveryCard(item: NormalizedFeedItem): Promise<DiscoveryCard> {
  // Resolve cover image URL and dimensions
  let coverImageUrl: string | null = null;
  let coverImageWidth: number | null = null;
  let coverImageHeight: number | null = null;

  if (item.coverStatus === 'ready') {
    if (item.coverDerivatives) {
      // Postgres path: we have derivatives, pick small (640px WebP preferred)
      const small = pickSmallDerivative(item.coverDerivatives);
      if (small) {
        coverImageUrl = await presignDownload({ key: small.key }).catch(() => null);
        coverImageWidth = small.width;
        coverImageHeight = small.height;
      }
    } else if (item.coverImageKey) {
      // Typesense path: we only have the key, presign it directly
      // Note: Typesense stores the coverImageKey which should be the small derivative key
      coverImageUrl = await presignDownload({ key: item.coverImageKey }).catch(() => null);
      // Dimensions not available from Typesense - UI handles null dimensions gracefully
    }
  }

  // Resolve taxonomy labels in parallel
  const [city, bhk] = await Promise.all([
    resolveLabel('city', item.citySlug),
    resolveLabel('bhk', item.bhkSlug),
  ]);

  return {
    slug: item.slug,
    title: item.title,
    coverImageUrl,
    coverImageWidth,
    coverImageHeight,
    designerName: item.designerName,
    designerSlug: item.designerSlug,
    city,
    bhk,
    ratingSnippet: formatRatingSnippet(item.avgRating, item.reviewCount),
  };
}
