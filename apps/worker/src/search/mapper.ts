import type { DesignerSearchDocument, ProjectSearchDocument } from '@repo/search';

export type SearchImageDerivative = {
  variant: string;
  format: string;
  key: string;
  width: number;
  height: number;
};

export type ProjectSearchSource = {
  project: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    designerId: string;
    citySlug: string | null;
    localitySlug: string | null;
    propertyTypeSlug: string | null;
    propertySubtypeSlug: string | null;
    scopeSlug: string | null;
    bhkSlug: string | null;
    budgetBandSlug: string | null;
    sizeSqft: number | null;
    publishedAt: Date;
    featuredAt: Date | null;
  };
  designer: {
    slug: string | null;
    displayName: string;
    avgRating: string;
    reviewCount: number;
  };
  cover: {
    id: string;
    status: 'processing' | 'ready' | 'failed';
    derivatives: SearchImageDerivative[];
  } | null;
  rooms: Array<{
    slug: string;
    label: string;
    name: string;
    labels: string[];
    attributeLabels: string[];
  }>;
  images: Array<{
    themeSlugs: string[];
    materialSlugs: string[];
    finishSlugs: string[];
    tagSlugs: string[];
  }>;
};

export type DesignerSearchSource = {
  profile: {
    id: string;
    slug: string | null;
    displayName: string;
    bio: string | null;
    entityType: 'individual' | 'company';
    yearsExperience: number;
    projectCount: number;
    avgRating: string;
    reviewCount: number;
    logoImageId: string | null;
    updatedAt: Date;
  };
  footprint: Array<{
    kind: string;
    slug: string;
  }>;
};

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function pickCoverDerivative(derivatives: SearchImageDerivative[]): SearchImageDerivative | null {
  return (
    derivatives.find((derivative) => derivative.variant === 'thumb' && derivative.format === 'webp')
      ??
    derivatives.find((derivative) => derivative.variant === 'thumb') ??
    derivatives[0] ??
    null
  );
}

export function mapProjectSearchDocument(source: ProjectSearchSource): ProjectSearchDocument {
  const cover = source.cover?.status === 'ready'
    ? pickCoverDerivative(source.cover.derivatives)
    : null;
  return {
    id: source.project.id,
    slug: source.project.slug,
    title: source.project.title,
    description: source.project.description,
    designerId: source.project.designerId,
    designerSlug: source.designer.slug,
    designerName: source.designer.displayName,
    citySlug: source.project.citySlug,
    localitySlug: source.project.localitySlug,
    propertyTypeSlug: source.project.propertyTypeSlug,
    propertySubtypeSlug: source.project.propertySubtypeSlug,
    scopeSlug: source.project.scopeSlug,
    bhkSlug: source.project.bhkSlug,
    budgetBandSlug: source.project.budgetBandSlug,
    sizeSqft: source.project.sizeSqft,
    themes: uniqueSorted(source.images.flatMap((image) => image.themeSlugs)),
    materials: uniqueSorted(source.images.flatMap((image) => image.materialSlugs)),
    finishes: uniqueSorted(source.images.flatMap((image) => image.finishSlugs)),
    roomSlugs: uniqueSorted(source.rooms.map((room) => room.slug)),
    roomLabels: uniqueSorted(
      source.rooms.flatMap((room) => [
        room.label,
        room.name,
        ...room.labels,
        ...room.attributeLabels,
      ]),
    ),
    tags: uniqueSorted(source.images.flatMap((image) => image.tagSlugs)),
    coverImageKey: cover?.key ?? null,
    coverImageId: cover ? (source.cover?.id ?? null) : null,
    coverImageWidth: cover?.width ?? null,
    coverImageHeight: cover?.height ?? null,
    publishedAt: source.project.publishedAt.getTime(),
    featuredAt: source.project.featuredAt?.getTime() ?? null,
    avgRating: Number(source.designer.avgRating),
    reviewCount: source.designer.reviewCount,
  };
}

export function mapDesignerSearchDocument(source: DesignerSearchSource): DesignerSearchDocument {
  const slugs = (kind: string) =>
    uniqueSorted(source.footprint.filter((term) => term.kind === kind).map((term) => term.slug));

  return {
    id: source.profile.id,
    slug: source.profile.slug,
    displayName: source.profile.displayName,
    bio: source.profile.bio,
    entityType: source.profile.entityType,
    citySlugs: slugs('city'),
    localitySlugs: slugs('locality'),
    scopeSlugs: slugs('scope'),
    themeSlugs: slugs('theme'),
    yearsExperience: source.profile.yearsExperience,
    projectCount: source.profile.projectCount,
    avgRating: Number(source.profile.avgRating),
    reviewCount: source.profile.reviewCount,
    logoImageKey: source.profile.logoImageId,
    updatedAt: source.profile.updatedAt.getTime(),
  };
}
