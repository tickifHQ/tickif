/** Disposable Typesense projection of a published project. Postgres is authoritative. */
export type ProjectSearchDocument = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  designerId: string;
  designerSlug: string | null;
  designerName: string;
  citySlug: string | null;
  /** Free-text city for projects outside the configured taxonomy. */
  cityName?: string | null;
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
  roomLabels: string[];
  tags: string[];
  /** Stable public-derivative key. API responses mint URLs at read time. */
  coverImageKey: string | null;
  /** Cover identity and rendered derivative dimensions for public card navigation/layout. */
  coverImageId?: string | null;
  coverImageWidth?: number | null;
  coverImageHeight?: number | null;
  /** Unix epoch milliseconds, kept numeric for deterministic sorting. */
  publishedAt: number;
  /** Unix epoch milliseconds for featured sort. Null → never featured. */
  featuredAt: number | null;
  /** Designer's average rating for rating snippet. */
  avgRating: number;
  /** Paid coverage end in epoch ms. Zero means no paid discovery priority. */
  paidUntil?: number;
  /** Effective tier after subscription lifecycle rules. */
  rankingTier?: number;
  /** Designer's review count for rating snippet. */
  reviewCount: number;
};

/** Disposable Typesense projection of a publicly visible designer portfolio. */
export type DesignerSearchDocument = {
  id: string;
  slug: string | null;
  displayName: string;
  bio: string | null;
  /** Public portfolio tagline, preferred over the longer profile bio on discovery cards. */
  tagline?: string | null;
  /** Terms from published portfolio content only. */
  portfolioTerms?: string[];
  entityType: 'individual' | 'company';
  citySlugs: string[];
  localitySlugs: string[];
  scopeSlugs: string[];
  themeSlugs: string[];
  yearsExperience: number;
  projectCount: number;
  avgRating: number;
  /** Paid coverage end in epoch ms. Zero means no paid discovery priority. */
  paidUntil?: number;
  /** Effective tier after subscription lifecycle rules. */
  rankingTier?: number;
  reviewCount: number;
  /** Optional while existing Typesense documents are backfilled after schema rollout. */
  isKycVerified?: boolean;
  /** Unix epoch milliseconds; 0 when the profile has never been approved. */
  kycExpiresAt?: number;
  /** Stable media key. API responses mint URLs at read time. */
  logoImageKey: string | null;
  /** Optional public portfolio hero used by designer discovery cards. */
  heroImageKey?: string | null;
  /** Unix epoch milliseconds, kept numeric for deterministic sorting. */
  updatedAt: number;
};
