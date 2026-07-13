import type {
  PortfolioBadge,
  PortfolioResponse,
  UpdatePortfolioInput,
  SlugAvailabilityResponse,
} from '@repo/contracts';
import { config } from '@repo/config';
import { presignUpload, objectExists, presignDownload, deleteObject } from '@repo/storage';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { portfolioRepository, withTransaction, type Tx } from './portfolio-repository.js';
import { profilesRepository, type DesignerProfileRecord } from './repository.js';
import { isOrgWriter } from '../orgs/repository.js';

/**
 * Portfolio business logic (E-222).
 * No Hono, no Drizzle — only domain operations.
 */

type Caller = {
  userId: string;
  activeOrgId: string | null;
};

const ALLOWED_LOGO_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MAX_LOGO_BYTES = 5_000_000;

type AuditEvent = {
  userId: string;
  activeOrgId: string;
  action: 'portfolio.updated' | 'portfolio.logo_uploaded' | 'portfolio.logo_deleted';
  timestamp: string; // ISO-8601
  resourceId: string; // profileId
  changedFields?: string[]; // for updates
};

/** Fire-and-forget audit log — never throws to caller. */
function emitAuditEvent(event: AuditEvent): void {
  try {
    console.info(JSON.stringify(event));
  } catch (err) {
    console.error('[audit] Failed to emit audit event:', err);
  }
}

/** Check if a DB error is a unique constraint violation, optionally on a specific constraint. */
function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== '23505'
  ) {
    return false;
  }
  if (!constraintName) return true;
  return (
    'constraint' in error &&
    (error as { constraint?: unknown }).constraint === constraintName
  );
}

function computeBadges(profile: DesignerProfileRecord): PortfolioBadge[] {
  const badges: PortfolioBadge[] = [];
  if (profile.status === 'active') badges.push('verified');
  const daysSinceCreation =
    (Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation < 90) badges.push('new');
  if (Number(profile.avgRating) >= 4.5 && profile.reviewCount >= 10)
    badges.push('top-performer');
  if (profile.yearsExperience >= 5) badges.push('established');
  if (profile.projectCount >= 28) badges.push('projects-published');
  return badges;
}

async function resolveProfile(caller: Caller): Promise<DesignerProfileRecord> {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  const canWrite = await isOrgWriter(caller.userId, caller.activeOrgId);
  if (!canWrite) {
    throw AppError.forbidden('Insufficient org role to manage portfolio');
  }
  const profile = await profilesRepository.findByOrgId(caller.activeOrgId);
  if (!profile) {
    throw AppError.notFound('No designer profile found for the active organization');
  }
  return profile;
}

export const portfolioService = {
  /**
   * GET portfolio. Creates default row if missing.
   * Returns merged data from designer_portfolio + designer_profile.
   */
  async getPortfolio(caller: Caller): Promise<PortfolioResponse> {
    const profile = await resolveProfile(caller);

    let portfolio = await portfolioRepository.findByProfileId(profile.id);
    if (!portfolio) {
      // Auto-create defaults on first read
      portfolio = await portfolioRepository.create(profile.id);
    }

    const badges = computeBadges(profile);
    const portfolioUrl = portfolio.portfolioSlug
      ? `${config.PUBLIC_WEB_URL}/p/${portfolio.portfolioSlug}`
      : `${config.PUBLIC_WEB_URL}/d/${profile.orgId}`;

    return {
      id: portfolio.id,
      publicLinkEnabled: portfolio.publicLinkEnabled,
      portfolioSlug: portfolio.portfolioSlug,
      accentColor: portfolio.accentColor,
      showHero: portfolio.showHero,
      showTrustCredentials: portfolio.showTrustCredentials,
      showFeaturedTestimonial: portfolio.showFeaturedTestimonial,
      showReviews: portfolio.showReviews,
      showSocialLinks: portfolio.showSocialLinks,
      showShareBlock: portfolio.showShareBlock,
      tagline: portfolio.tagline,
      displayName: profile.displayName,
      bio: profile.bio,
      logoUrl: profile.logoImageId ? profile.logoImageId : null,
      websiteUrl: profile.websiteUrl,
      instagramHandle: profile.instagramHandle,
      linkedinHandle: profile.linkedinHandle,
      youtubeHandle: profile.youtubeHandle,
      testimonialWords: portfolio.testimonialWords,
      testimonialAuthor: portfolio.testimonialAuthor,
      testimonialProjectId: portfolio.testimonialProjectId,
      showOverallRating: portfolio.showOverallRating,
      showPositiveReviewsOnly: portfolio.showPositiveReviewsOnly,
      showTickifBadge: portfolio.showTickifBadge,
      badges,
      portfolioUrl,
      publishedAt: portfolio.publishedAt?.toISOString() ?? null,
      createdAt: portfolio.createdAt.toISOString(),
      updatedAt: portfolio.updatedAt.toISOString(),
    };
  },

  /**
   * PATCH portfolio. Validates slug uniqueness and testimonial ownership.
   * All validations and writes run inside a single database transaction.
   */
  async updatePortfolio(
    input: UpdatePortfolioInput,
    caller: Caller,
  ): Promise<PortfolioResponse> {
    const profile = await resolveProfile(caller);

    await withTransaction(async (tx: Tx) => {
      let portfolio = await portfolioRepository.findByProfileId(profile.id);
      if (!portfolio) {
        portfolio = await portfolioRepository.create(profile.id);
      }

      // Validate slug if provided (inside transaction to prevent TOCTOU races)
      if (input.portfolioSlug !== undefined && input.portfolioSlug !== null) {
        if (portfolioRepository.isReservedSlug(input.portfolioSlug)) {
          throw AppError.conflict('This slug is reserved and cannot be used');
        }
        const available = await portfolioRepository.isSlugAvailableInTx(
          tx,
          input.portfolioSlug,
          profile.id,
        );
        if (!available) {
          throw AppError.conflict('This portfolio slug is already taken');
        }
      }

      // Validate testimonial project ownership (inside transaction)
      if (input.testimonialProjectId !== undefined && input.testimonialProjectId !== null) {
        const project = await portfolioRepository.findProjectForDesignerInTx(
          tx,
          input.testimonialProjectId,
          profile.id,
        );
        if (!project) {
          throw AppError.unprocessable('Testimonial project not found or does not belong to you');
        }
        if (project.status !== 'published') {
          throw AppError.unprocessable('Testimonial project must be published');
        }
      }

      // Split fields: profile fields vs portfolio fields
      const {
        displayName,
        bio,
        websiteUrl,
        instagramHandle,
        linkedinHandle,
        youtubeHandle,
        ...portfolioFields
      } = input;

      // Update profile fields if any provided (inside transaction)
      const profileUpdates: Record<string, unknown> = {};
      if (displayName !== undefined) profileUpdates.displayName = displayName;
      if (bio !== undefined) profileUpdates.bio = bio;
      if (websiteUrl !== undefined) profileUpdates.websiteUrl = websiteUrl;
      if (instagramHandle !== undefined) profileUpdates.instagramHandle = instagramHandle;
      if (linkedinHandle !== undefined) profileUpdates.linkedinHandle = linkedinHandle;
      if (youtubeHandle !== undefined) profileUpdates.youtubeHandle = youtubeHandle;

      if (Object.keys(profileUpdates).length > 0) {
        await portfolioRepository.updateProfileInTx(
          tx,
          profile.id,
          profileUpdates as Parameters<typeof portfolioRepository.updateProfileInTx>[2],
        );
      }

      // Build portfolio update payload
      const portfolioPatch: Record<string, unknown> = {};
      if (portfolioFields.publicLinkEnabled !== undefined)
        portfolioPatch.publicLinkEnabled = portfolioFields.publicLinkEnabled;
      if (portfolioFields.portfolioSlug !== undefined)
        portfolioPatch.portfolioSlug = portfolioFields.portfolioSlug;
      if (portfolioFields.accentColor !== undefined)
        portfolioPatch.accentColor = portfolioFields.accentColor;
      if (portfolioFields.showHero !== undefined)
        portfolioPatch.showHero = portfolioFields.showHero;
      if (portfolioFields.showTrustCredentials !== undefined)
        portfolioPatch.showTrustCredentials = portfolioFields.showTrustCredentials;
      if (portfolioFields.showFeaturedTestimonial !== undefined)
        portfolioPatch.showFeaturedTestimonial = portfolioFields.showFeaturedTestimonial;
      if (portfolioFields.showReviews !== undefined)
        portfolioPatch.showReviews = portfolioFields.showReviews;
      if (portfolioFields.showSocialLinks !== undefined)
        portfolioPatch.showSocialLinks = portfolioFields.showSocialLinks;
      if (portfolioFields.showShareBlock !== undefined)
        portfolioPatch.showShareBlock = portfolioFields.showShareBlock;
      if (portfolioFields.tagline !== undefined)
        portfolioPatch.tagline = portfolioFields.tagline;
      if (portfolioFields.testimonialWords !== undefined)
        portfolioPatch.testimonialWords = portfolioFields.testimonialWords;
      if (portfolioFields.testimonialAuthor !== undefined)
        portfolioPatch.testimonialAuthor = portfolioFields.testimonialAuthor;
      if (portfolioFields.testimonialProjectId !== undefined) {
        portfolioPatch.testimonialProjectId = portfolioFields.testimonialProjectId;
        portfolioPatch.testimonialUpdatedAt = new Date();
      }
      if (portfolioFields.showOverallRating !== undefined)
        portfolioPatch.showOverallRating = portfolioFields.showOverallRating;
      if (portfolioFields.showPositiveReviewsOnly !== undefined)
        portfolioPatch.showPositiveReviewsOnly = portfolioFields.showPositiveReviewsOnly;
      if (portfolioFields.showTickifBadge !== undefined)
        portfolioPatch.showTickifBadge = portfolioFields.showTickifBadge;

      if (Object.keys(portfolioPatch).length > 0 || Object.keys(profileUpdates).length === 0) {
        try {
          await portfolioRepository.upsertInTx(tx, profile.id, portfolioPatch);
        } catch (err: unknown) {
          if (isUniqueViolation(err, 'designer_portfolio_portfolio_slug_unique')) {
            throw AppError.conflict('This portfolio slug is already taken');
          }
          throw err;
        }
      }
    });

    // Emit audit event (fire-and-forget, AFTER commit — not inside transaction)
    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof typeof input] !== undefined,
    );
    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.updated',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
      changedFields,
    });

    // Return fresh state after commit
    return this.getPortfolio(caller);
  },

  /** Check slug availability for the current designer. */
  async checkSlugAvailability(
    slug: string,
    caller: Caller,
  ): Promise<SlugAvailabilityResponse> {
    const profile = await resolveProfile(caller);

    if (portfolioRepository.isReservedSlug(slug)) {
      return { slug, available: false };
    }

    const available = await portfolioRepository.isSlugAvailable(slug, profile.id);
    return { slug, available };
  },

  /** Mint a presigned upload URL for a logo image. */
  async createLogoUploadUrl(
    input: { contentType: string; contentLength: number },
    caller: Caller,
  ): Promise<{ uploadUrl: string; key: string }> {
    const profile = await resolveProfile(caller);

    // Defense-in-depth: validate content type even though Zod contract already checks
    if (!ALLOWED_LOGO_CONTENT_TYPES.has(input.contentType)) {
      throw AppError.unprocessable('Unsupported content type for logo upload');
    }

    if (input.contentLength > MAX_LOGO_BYTES) {
      throw AppError.unprocessable('Declared size exceeds the logo size limit');
    }

    const key = `originals/logos/${profile.id}/${randomUUID()}`;
    const uploadUrl = await presignUpload({
      key,
      contentType: input.contentType,
      contentLength: input.contentLength,
    });

    return { uploadUrl, key };
  },

  /** Confirm a logo was uploaded and persist the association. */
  async commitLogoUpload(
    input: { objectKey: string },
    caller: Caller,
  ): Promise<{ logoUrl: string }> {
    const profile = await resolveProfile(caller);

    const exists = await objectExists(input.objectKey);
    if (!exists) {
      throw AppError.badRequest('No uploaded object found for this image');
    }

    await profilesRepository.updateProfile(profile.id, { logoImageId: input.objectKey });

    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.logo_uploaded',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
    });

    const logoUrl = await presignDownload({ key: input.objectKey });

    return { logoUrl };
  },

  /** Delete the current logo from storage and clear the DB association. */
  async deleteLogo(caller: Caller): Promise<void> {
    const profile = await resolveProfile(caller);

    if (!profile.logoImageId) {
      throw AppError.notFound('No logo exists to delete');
    }

    // Storage delete MUST succeed before clearing the DB record.
    // If this throws, the DB remains untouched (no orphan risk).
    try {
      await deleteObject(profile.logoImageId);
    } catch (err) {
      console.error('[deleteLogo] Storage delete failed:', err);
      throw new AppError('internal_error', 'Failed to delete logo from storage', 500);
    }

    // Storage delete succeeded — now clear the DB association.
    await profilesRepository.updateProfile(profile.id, { logoImageId: null });

    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.logo_deleted',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
    });
  },
};
