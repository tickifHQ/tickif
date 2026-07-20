/** Disposable Meilisearch projection of a published project. Postgres is authoritative. */
export type ProjectSearchDocument = {
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
  roomLabels: string[];
  tags: string[];
  /** Stable public-derivative key. API responses mint URLs at read time. */
  coverImageKey: string | null;
  /** Unix epoch milliseconds, kept numeric for deterministic sorting. */
  publishedAt: number;
};

/** Disposable Meilisearch projection of an active designer profile. */
export type DesignerSearchDocument = {
  id: string;
  slug: string | null;
  displayName: string;
  bio: string | null;
  entityType: 'individual' | 'company';
  citySlugs: string[];
  localitySlugs: string[];
  scopeSlugs: string[];
  themeSlugs: string[];
  yearsExperience: number;
  projectCount: number;
  avgRating: number;
  reviewCount: number;
  /** Stable media key. API responses mint URLs at read time. */
  logoImageKey: string | null;
  /** Unix epoch milliseconds, kept numeric for deterministic sorting. */
  updatedAt: number;
};
