import type { Derivative } from '@repo/contracts';

/**
 * Internal types for the discovery module (E-267).
 *
 * These are NOT exported in the public contract — they define the shared
 * intermediate model that both the Meilisearch path and PostgreSQL fallback
 * path normalize into before the single `toFeedCard()` mapper runs.
 */

// ---------------------------------------------------------------------------
// Common intermediate model
// ---------------------------------------------------------------------------

/** Both Meili hits and Postgres rows normalize into this before mapping. */
export type DiscoveryIntermediateModel = {
  id: string;
  slug: string;
  title: string;
  designerId: string;
  designerName: string;
  designerSlug: string | null;
  citySlug: string | null;
  localitySlug: string | null;
  bhkSlug: string | null;
  budgetBandSlug: string | null;
  scopeSlug: string | null;
  propertySubtypeSlug: string | null;
  rating: number;
  reviewCount: number;
  /** Storage key for cover image derivative — service signs this into a URL. */
  coverImageKey: string | null;
  coverDerivatives: Derivative[] | null;
  coverStatus: string | null;
  coverWidth: number | null;
  coverHeight: number | null;
};

// ---------------------------------------------------------------------------
// PostgreSQL fallback row
// ---------------------------------------------------------------------------

/** Row shape returned by discoveryRepository.listFeed() — plain DB record. */
export type DiscoveryFeedRow = {
  id: string;
  slug: string;
  title: string;
  designerId: string;
  designerName: string;
  designerSlug: string | null;
  citySlug: string | null;
  localitySlug: string | null;
  bhkSlug: string | null;
  budgetBandSlug: string | null;
  scopeSlug: string | null;
  propertySubtypeSlug: string | null;
  rating: string; // numeric → string from Drizzle
  reviewCount: number;
  coverStatus: string | null;
  coverDerivatives: Derivative[] | null;
  coverWidth: number | null;
  coverHeight: number | null;
  publishedAt: Date | null;
  featuredAt: Date | null;
};

// ---------------------------------------------------------------------------
// Filter / sort types
// ---------------------------------------------------------------------------

export type DiscoveryFilters = Partial<Record<string, string[]>>;

export type DiscoverySort = 'recent' | 'featured';
