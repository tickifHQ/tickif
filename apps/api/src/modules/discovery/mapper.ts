import { presignDownload } from '@repo/storage';
import type { DiscoveryCard, Derivative } from '@repo/contracts';
import type { ProjectSearchDocument } from '@repo/search';
import type { FeedProjectRow } from './repository.js';
import type { TaxonomyKind } from '../projects/repository.js';

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
  id: string;
  title: string;
  designerName: string;
  designerSlug: string | null;
  citySlug: string | null;
  localitySlug: string | null;
  bhkSlug: string | null;
  budgetBandSlug: string | null;
  themeSlugs: string[];
  avgRating: number;
  reviewCount: number;
  /** For Typesense: the coverImageKey. For Postgres: null (we have derivatives). */
  coverImageKey: string | null;
  coverImageId: string | null;
  coverImageWidth: number | null;
  coverImageHeight: number | null;
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
    id: hit.id,
    slug: hit.slug,
    title: hit.title,
    designerName: hit.designerName,
    designerSlug: hit.designerSlug,
    citySlug: hit.citySlug,
    localitySlug: hit.localitySlug,
    bhkSlug: hit.bhkSlug,
    budgetBandSlug: hit.budgetBandSlug,
    themeSlugs: hit.themes,
    avgRating: hit.avgRating ?? 0,
    reviewCount: hit.reviewCount ?? 0,
    coverImageKey: hit.coverImageKey,
    coverImageId: hit.coverImageId ?? null,
    coverImageWidth: hit.coverImageWidth ?? null,
    coverImageHeight: hit.coverImageHeight ?? null,
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
    id: row.id,
    slug: row.slug,
    title: row.title,
    designerName: row.designerName,
    designerSlug: row.designerSlug,
    citySlug: row.citySlug,
    localitySlug: row.localitySlug,
    bhkSlug: row.bhkSlug,
    budgetBandSlug: row.budgetBandSlug,
    themeSlugs: [],
    avgRating: Number(row.avgRating) || 0,
    reviewCount: row.reviewCount,
    coverImageKey: null,
    coverImageId: row.coverImageId,
    coverImageWidth: null,
    coverImageHeight: null,
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
function pickPreviewDerivative(derivatives: Derivative[] | null): Derivative | null {
  if (!derivatives) return null;
  return (
    derivatives.find((d) => d.variant === 'small' && d.format === 'webp') ??
    derivatives.find((d) => d.variant === 'small') ??
    derivatives.find((d) => d.variant === 'thumb' && d.format === 'webp') ??
    derivatives.find((d) => d.variant === 'thumb') ??
    null
  );
}

/**
 * Collect the distinct taxonomy pairs a page of items needs, so the caller can
 * resolve every label in one query.
 *
 * Resolving per card would cost two round trips per item — 48 for a default
 * `limit: 24` page on an unauthenticated endpoint.
 */
export function collectTaxonomyPairs(
  items: NormalizedFeedItem[],
): Array<{ kind: TaxonomyKind; slug: string }> {
  const seen = new Set<string>();
  const pairs: Array<{ kind: TaxonomyKind; slug: string }> = [];

  const add = (kind: TaxonomyKind, slug: string | null) => {
    if (!slug) return;
    const key = `${kind}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ kind, slug });
  };

  for (const item of items) {
    add('city', item.citySlug);
    add('bhk', item.bhkSlug);
    add('budget_band', item.budgetBandSlug);
    for (const theme of item.themeSlugs) add('theme', theme);
  }

  return pairs;
}

/** Read a label out of the pre-resolved map. Null slugs and misses both yield null. */
function labelOf(
  labels: Map<string, string>,
  kind: TaxonomyKind,
  slug: string | null,
): string | null {
  return slug ? (labels.get(`${kind}:${slug}`) ?? null) : null;
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
export async function toDiscoveryCard(
  item: NormalizedFeedItem,
  labels: Map<string, string>,
  localityLabels: Map<string, string> = new Map(),
): Promise<DiscoveryCard> {
  // Resolve cover image URL and dimensions
  let coverImageUrl: string | null = null;
  let coverImageWidth: number | null = null;
  let coverImageHeight: number | null = null;

  if (item.coverStatus === 'ready') {
    if (item.coverDerivatives) {
      // Postgres path: we have derivatives, pick small (640px WebP preferred)
      const preview = pickPreviewDerivative(item.coverDerivatives);
      if (preview) {
        coverImageUrl = await presignDownload({ key: preview.key }).catch(() => null);
        coverImageWidth = preview.width;
        coverImageHeight = preview.height;
      }
    } else if (item.coverImageKey) {
      // Typesense path: we only have the key, presign it directly
      // Note: Typesense stores the coverImageKey which should be the small derivative key
      coverImageUrl = await presignDownload({ key: item.coverImageKey }).catch(() => null);
      coverImageWidth = item.coverImageWidth;
      coverImageHeight = item.coverImageHeight;
    }
  }

  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    studio: item.designerName,
    city: labelOf(labels, 'city', item.citySlug),
    locality:
      item.citySlug && item.localitySlug
        ? (localityLabels.get(`${item.citySlug}:${item.localitySlug}`) ?? null)
        : null,
    rating: item.avgRating,
    reviewCount: item.reviewCount,
    budget: labelOf(labels, 'budget_band', item.budgetBandSlug),
    tags: [
      labelOf(labels, 'bhk', item.bhkSlug),
      ...item.themeSlugs.map((slug) => labelOf(labels, 'theme', slug)),
    ].filter((tag): tag is string => tag !== null),
    coverImageId: item.coverImageId,
    coverImageUrl,
    imageWidth: coverImageWidth,
    imageHeight: coverImageHeight,
  };
}
