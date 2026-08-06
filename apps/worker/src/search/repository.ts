import { and, asc, db, eq, isNotNull, schema, sql } from '@repo/db';
import type { DesignerSearchSource, ProjectSearchSource } from './mapper.js';

const PAGE_LIMIT_MAX = 500;

function boundedLimit(limit: number): number {
  return Math.max(1, Math.min(Math.floor(limit), PAGE_LIMIT_MAX));
}

function metadataLabels(metadata: typeof schema.projectRoom.$inferSelect.metadata): {
  labels: string[];
  attributeLabels: string[];
} {
  const labels = Array.isArray(metadata.labels)
    ? metadata.labels.filter((value): value is string => typeof value === 'string')
    : [];
  const attributeLabels =
    metadata.attributeLabels && typeof metadata.attributeLabels === 'object'
      ? Object.values(metadata.attributeLabels).flatMap((values) =>
          Array.isArray(values)
            ? values.filter((value): value is string => typeof value === 'string')
            : [],
        )
      : [];
  return { labels, attributeLabels };
}

export async function findProjectSearchSource(
  projectId: string,
): Promise<ProjectSearchSource | null> {
  const cover = schema.projectImage;
  const [base] = await db
    .select({
      project: {
        id: schema.project.id,
        slug: schema.project.slug,
        title: schema.project.title,
        description: schema.project.description,
        designerId: schema.project.designerId,
        citySlug: schema.project.citySlug,
        localitySlug: schema.project.localitySlug,
        propertyTypeSlug: schema.project.propertyTypeSlug,
        propertySubtypeSlug: schema.project.propertySubtypeSlug,
        scopeSlug: schema.project.scopeSlug,
        bhkSlug: schema.project.bhkSlug,
        budgetBandSlug: schema.project.budgetBandSlug,
        sizeSqft: schema.project.sizeSqft,
        publishedAt: schema.project.publishedAt,
        featuredAt: schema.project.featuredAt,
      },
      designer: {
        slug: schema.organization.slug,
        displayName: schema.designerProfile.displayName,
        avgRating: schema.designerProfile.avgRating,
        reviewCount: schema.designerProfile.reviewCount,
      },
      cover: {
        id: cover.id,
        status: cover.status,
        derivatives: cover.derivatives,
      },
    })
    .from(schema.project)
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
    .leftJoin(cover, eq(schema.project.coverImageId, cover.id))
    .where(
      and(
        eq(schema.project.id, projectId),
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
        isNotNull(schema.project.publishedAt),
      ),
    )
    .limit(1);

  if (!base || !base.project.publishedAt) return null;

  const [rooms, images] = await Promise.all([
    db
      .select({
        slug: schema.taxonomy.slug,
        label: schema.taxonomy.label,
        name: schema.projectRoom.name,
        metadata: schema.projectRoom.metadata,
      })
      .from(schema.projectRoom)
      .innerJoin(schema.taxonomy, eq(schema.projectRoom.roomTypeId, schema.taxonomy.id))
      .where(eq(schema.projectRoom.projectId, projectId))
      .orderBy(asc(schema.projectRoom.sortOrder), asc(schema.projectRoom.id)),
    db
      .select({
        themeSlugs: schema.projectImage.themeSlugs,
        materialSlugs: schema.projectImage.materialSlugs,
        finishSlugs: schema.projectImage.finishSlugs,
        tagSlugs: schema.projectImage.tagSlugs,
      })
      .from(schema.projectImage)
      .where(
        and(eq(schema.projectImage.projectId, projectId), eq(schema.projectImage.status, 'ready')),
      ),
  ]);

  return {
    project: { ...base.project, publishedAt: base.project.publishedAt },
    designer: base.designer,
    cover: base.cover?.id
      ? {
          status: base.cover.status,
          derivatives: base.cover.derivatives,
        }
      : null,
    rooms: rooms.map((room) => ({ ...room, ...metadataLabels(room.metadata) })),
    images,
  };
}

export async function findDesignerSearchSource(
  profileId: string,
): Promise<DesignerSearchSource | null> {
  const [profile] = await db
    .select({
      id: schema.designerProfile.id,
      slug: schema.organization.slug,
      displayName: schema.designerProfile.displayName,
      bio: schema.designerProfile.bio,
      entityType: schema.designerProfile.entityType,
      yearsExperience: schema.designerProfile.yearsExperience,
      projectCount: schema.designerProfile.projectCount,
      avgRating: schema.designerProfile.avgRating,
      reviewCount: schema.designerProfile.reviewCount,
      logoImageId: schema.designerProfile.logoImageId,
      updatedAt: schema.designerProfile.updatedAt,
    })
    .from(schema.designerProfile)
    .innerJoin(schema.organization, eq(schema.designerProfile.orgId, schema.organization.id))
    .where(
      and(eq(schema.designerProfile.id, profileId), eq(schema.designerProfile.status, 'active')),
    )
    .limit(1);

  if (!profile) return null;

  const footprint = await db
    .select({
      kind: schema.taxonomy.kind,
      slug: schema.taxonomy.slug,
    })
    .from(schema.designerProfileFootprint)
    .innerJoin(schema.taxonomy, eq(schema.designerProfileFootprint.taxonomyId, schema.taxonomy.id))
    .where(eq(schema.designerProfileFootprint.profileId, profileId));

  return { profile, footprint };
}

export async function listSearchableProjectIds(
  afterId: string | null,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .innerJoin(schema.designerProfile, eq(schema.project.designerId, schema.designerProfile.id))
    .where(
      and(
        eq(schema.project.status, 'published'),
        eq(schema.designerProfile.status, 'active'),
        isNotNull(schema.project.publishedAt),
        afterId ? sql`${schema.project.id} > ${afterId}` : undefined,
      ),
    )
    .orderBy(asc(schema.project.id))
    .limit(boundedLimit(limit));
  return rows.map((row) => row.id);
}

export async function listActiveDesignerIds(
  afterId: string | null,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.designerProfile.id })
    .from(schema.designerProfile)
    .where(
      and(
        eq(schema.designerProfile.status, 'active'),
        afterId ? sql`${schema.designerProfile.id} > ${afterId}` : undefined,
      ),
    )
    .orderBy(asc(schema.designerProfile.id))
    .limit(boundedLimit(limit));
  return rows.map((row) => row.id);
}

export async function listPublishedProjectIdsForDesigner(
  profileId: string,
  afterId: string | null,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(
      and(
        eq(schema.project.designerId, profileId),
        eq(schema.project.status, 'published'),
        afterId ? sql`${schema.project.id} > ${afterId}` : undefined,
      ),
    )
    .orderBy(asc(schema.project.id))
    .limit(boundedLimit(limit));
  return rows.map((row) => row.id);
}
