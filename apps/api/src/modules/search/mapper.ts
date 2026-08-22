/**
 * Search response mappers — transform Typesense documents to API response shapes.
 *
 * Responsibilities:
 * - Transform ProjectSearchDocument → ProjectHit with presigned coverImageUrl
 * - Transform DesignerSearchDocument → DesignerHit with presigned logoUrl
 * - Transform documents to minimal suggest response shapes
 * - Handle null image keys by setting URL to null
 */
import { presignDownload } from '@repo/storage';
import type { ProjectSearchDocument, DesignerSearchDocument } from '@repo/search';
import type { ProjectHit, DesignerHit, SuggestProject, SuggestDesigner } from '@repo/contracts';
import type { RecentProject } from './repository.js';

// ─────────────────────────────────────────────────────────────────────────────
// Project Mappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform a ProjectSearchDocument from Typesense to a ProjectHit API response.
 * Presigns the coverImageKey to generate a coverImageUrl.
 */
export async function mapProjectHit(doc: ProjectSearchDocument): Promise<ProjectHit> {
  const coverImageUrl = doc.coverImageKey
    ? await presignDownload({ key: doc.coverImageKey })
    : null;

  return {
    id: doc.id,
    slug: doc.slug ?? doc.id,
    title: doc.title,
    description: doc.description ?? null,
    designerId: doc.designerId,
    designerSlug: doc.designerSlug ?? null,
    designerName: doc.designerName,
    citySlug: doc.citySlug ?? null,
    localitySlug: doc.localitySlug ?? null,
    propertyTypeSlug: doc.propertyTypeSlug ?? null,
    propertySubtypeSlug: doc.propertySubtypeSlug ?? null,
    scopeSlug: doc.scopeSlug ?? null,
    bhkSlug: doc.bhkSlug ?? null,
    budgetBandSlug: doc.budgetBandSlug ?? null,
    sizeSqft: doc.sizeSqft ?? null,
    themes: doc.themes,
    materials: doc.materials,
    finishes: doc.finishes,
    roomSlugs: doc.roomSlugs,
    coverImageUrl,
    publishedAt: doc.publishedAt, // Already Unix ms in document
  };
}

/**
 * Transform a RecentProject from Postgres fallback to a ProjectHit API response.
 * Converts Date to Unix ms and presigns the coverImageKey.
 */
export async function mapRecentProject(project: RecentProject): Promise<ProjectHit> {
  const coverImageUrl = project.coverImageKey
    ? await presignDownload({ key: project.coverImageKey })
    : null;

  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    designerId: project.designerId,
    designerSlug: project.designerSlug,
    designerName: project.designerName,
    citySlug: project.citySlug,
    localitySlug: project.localitySlug,
    propertyTypeSlug: project.propertyTypeSlug,
    propertySubtypeSlug: project.propertySubtypeSlug,
    scopeSlug: project.scopeSlug,
    bhkSlug: project.bhkSlug,
    budgetBandSlug: project.budgetBandSlug,
    sizeSqft: project.sizeSqft,
    themes: project.themes,
    materials: project.materials,
    finishes: project.finishes,
    roomSlugs: project.roomSlugs,
    coverImageUrl,
    publishedAt: project.publishedAt.getTime(), // Convert Date to Unix ms
  };
}

/**
 * Transform a ProjectSearchDocument to minimal SuggestProject response.
 * Only includes fields needed for autocomplete display.
 */
export async function mapSuggestProject(doc: ProjectSearchDocument): Promise<SuggestProject> {
  const coverImageUrl = doc.coverImageKey
    ? await presignDownload({ key: doc.coverImageKey })
    : null;

  return {
    id: doc.id,
    slug: doc.slug ?? doc.id,
    title: doc.title,
    designerName: doc.designerName,
    citySlug: doc.citySlug ?? null,
    coverImageUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Designer Mappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform a DesignerSearchDocument from Typesense to a DesignerHit API response.
 * Presigns the logoImageKey to generate a logoUrl.
 */
export async function mapDesignerHit(doc: DesignerSearchDocument): Promise<DesignerHit> {
  const logoUrl = doc.logoImageKey ? await presignDownload({ key: doc.logoImageKey }) : null;

  return {
    id: doc.id,
    slug: doc.slug ?? null,
    displayName: doc.displayName,
    bio: doc.bio ?? null,
    entityType: doc.entityType,
    citySlugs: doc.citySlugs,
    localitySlugs: doc.localitySlugs,
    scopeSlugs: doc.scopeSlugs,
    themeSlugs: doc.themeSlugs,
    yearsExperience: doc.yearsExperience,
    projectCount: doc.projectCount,
    avgRating: doc.avgRating,
    reviewCount: doc.reviewCount,
    isKycVerified: doc.isKycVerified === true && (doc.kycExpiresAt ?? 0) > Date.now(),
    logoUrl,
  };
}

/**
 * Transform a DesignerSearchDocument to minimal SuggestDesigner response.
 * Only includes fields needed for autocomplete display.
 */
export async function mapSuggestDesigner(doc: DesignerSearchDocument): Promise<SuggestDesigner> {
  const logoUrl = doc.logoImageKey ? await presignDownload({ key: doc.logoImageKey }) : null;

  return {
    id: doc.id,
    slug: doc.slug ?? null,
    displayName: doc.displayName,
    citySlugs: doc.citySlugs,
    logoUrl,
    projectCount: doc.projectCount,
  };
}
