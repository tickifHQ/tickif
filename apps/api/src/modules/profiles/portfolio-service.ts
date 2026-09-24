import type {
  PortfolioBadge,
  PortfolioResponse,
  RequiredPortfolioField,
  UpdatePortfolioInput,
  SlugAvailabilityResponse,
  LogoCropArea,
} from '@repo/contracts';
import { ORGANIZATION_CAPABILITY } from '@repo/contracts';
import { presignUpload, objectExists, presignDownload, deleteObject } from '@repo/storage';
import { config } from '@repo/config';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import {
  portfolioRepository,
  withTransaction,
  type PortfolioRecord,
  type Tx,
} from './portfolio-repository.js';
import { profilesRepository, type DesignerProfileRecord } from './repository.js';
import { orgsService } from '../orgs/service.js';
import { googleReviewsRepository } from './google-repository.js';
import { readState } from './google-mapper.js';

/**
 * Portfolio business logic (E-222).
 * No Hono, no Drizzle — only domain operations.
 */

export type Caller = {
  userId: string;
  activeOrgId: string | null;
  activeTeamId?: string | null;
};

const ALLOWED_LOGO_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const ALLOWED_HERO_COVER_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MAX_HERO_COVER_BYTES = 10_000_000;
const MAX_DISPLAY_LOGO_BYTES = 5_000_000;
const MAX_SOURCE_LOGO_BYTES = 10_000_000;

// Badge thresholds
const BADGE_NEW_DAYS = 90;
const BADGE_TOP_PERFORMER_RATING = 4.5;
const BADGE_TOP_PERFORMER_REVIEWS = 10;
const BADGE_ESTABLISHED_YEARS = 5;
/** Minimum published projects for the "projects-published" badge. */
const BADGE_PROJECTS_PUBLISHED_COUNT = 25;

type AuditEvent = {
  userId: string;
  activeOrgId: string;
  action: 'portfolio.updated' | 'portfolio.logo_uploaded' | 'portfolio.hero_cover_uploaded';
  timestamp: string; // ISO-8601
  resourceId: string; // profileId
  changedFields?: string[]; // for updates
};

/** Fire-and-forget audit log — never throws to caller. */
// TODO: replace console.info with a real audit sink (structured log/event bus)
function emitAuditEvent(event: AuditEvent): void {
  try {
    console.info(JSON.stringify(event));
  } catch (err) {
    console.error('[audit] Failed to emit audit event:', err);
  }
}

/** Check if a DB error is a unique constraint violation, optionally on a specific constraint. */
function isUniqueViolation(error: unknown, constraintName?: string): boolean {
  // Drizzle wraps PostgreSQL errors — check both the error itself and its cause
  const candidates: unknown[] = [error];
  if (error instanceof Error && error.cause) {
    candidates.push(error.cause);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    if (!('code' in candidate)) continue;
    if ((candidate as { code?: unknown }).code !== '23505') continue;

    // Found a 23505 error — check constraint name if specified
    if (!constraintName) return true;
    if (
      'constraint' in candidate &&
      (candidate as { constraint?: unknown }).constraint === constraintName
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The slug a public portfolio URL should use: the designer's chosen slug when
 * set, else the owning organization slug (which every profile has from onboarding).
 */
export function publicPortfolioSlug(portfolioSlug: string | null, orgSlug: string): string {
  return portfolioSlug ?? orgSlug;
}

/** Absolute `/d/{slug}` URL for a designer's public portfolio. */
export function publicPortfolioUrl(portfolioSlug: string | null, orgSlug: string): string {
  return `${config.PUBLIC_WEB_URL}/d/${publicPortfolioSlug(portfolioSlug, orgSlug)}`;
}

/**
 * Presign the logo for display, or null when unset.
 *
 * The prefix check prevents IDOR: only keys minted for this profile are signed,
 * so a tampered `logo_image_id` can't be used to read another profile's object.
 */
export async function presignProfileLogo(profile: DesignerProfileRecord): Promise<string | null> {
  const expectedPrefix = `originals/logos/${profile.id}/`;
  if (!profile.logoImageId || !profile.logoImageId.startsWith(expectedPrefix)) return null;
  return presignDownload({ key: profile.logoImageId });
}

/** Presign a dedicated Hero cover only when its storage key belongs to this profile. */
export async function presignPortfolioHeroCover(
  profileId: string,
  portfolio: Pick<PortfolioRecord, 'heroImageId'>,
): Promise<string | null> {
  const expectedPrefix = `originals/portfolio-covers/${profileId}/`;
  if (!portfolio.heroImageId || !portfolio.heroImageId.startsWith(expectedPrefix)) return null;
  return presignDownload({ key: portfolio.heroImageId });
}

/** Presign the private untouched source used only by the owner-side crop editor. */
export async function presignProfileLogoSource(
  profile: DesignerProfileRecord,
): Promise<string | null> {
  const expectedPrefix = `originals/logos/${profile.id}/`;
  if (!profile.logoSourceImageId || !profile.logoSourceImageId.startsWith(expectedPrefix)) {
    return null;
  }
  return presignDownload({ key: profile.logoSourceImageId });
}

export function computeBadges(
  profile: DesignerProfileRecord,
  isKycVerified = false,
): PortfolioBadge[] {
  const badges: PortfolioBadge[] = [];
  if (isKycVerified) badges.push('verified');
  const daysSinceCreation = (Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation < BADGE_NEW_DAYS) badges.push('new');
  if (
    Number(profile.avgRating) >= BADGE_TOP_PERFORMER_RATING &&
    profile.reviewCount >= BADGE_TOP_PERFORMER_REVIEWS
  )
    badges.push('top-performer');
  if (profile.yearsExperience >= BADGE_ESTABLISHED_YEARS) badges.push('established');
  if (profile.projectCount >= BADGE_PROJECTS_PUBLISHED_COUNT) badges.push('projects-published');
  return badges;
}

/**
 * Required hero fields still blank, in the order the settings form presents them.
 *
 * A profile is created `draft` at onboarding and every public surface gates on
 * `status === 'active'`, so this is the rule that decides when a designer becomes
 * visible: fill the hero, go live. Whitespace-only values do not count — they
 * would render as an empty hero just the same.
 */
export function missingRequiredFields(
  profile: Pick<DesignerProfileRecord, 'logoImageId' | 'displayName' | 'bio'>,
  portfolio: Pick<PortfolioRecord, 'heroImageId' | 'showHero' | 'tagline'> | null,
): RequiredPortfolioField[] {
  const missing: RequiredPortfolioField[] = [];
  if ((portfolio?.showHero ?? true) && !isNonBlank(portfolio?.heroImageId)) {
    missing.push('heroCover');
  }
  if (!isNonBlank(profile.logoImageId)) missing.push('logo');
  if (!isNonBlank(profile.displayName)) missing.push('displayName');
  if (!isNonBlank(portfolio?.tagline)) missing.push('tagline');
  if (!isNonBlank(profile.bio)) missing.push('bio');
  return missing;
}

function isNonBlank(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Authoritative publication state shared by owner-facing and anonymous reads.
 *
 * A missing portfolio row uses the database default for the link toggle, but is
 * still incomplete because it cannot contain the required tagline. Keeping the
 * completeness check here prevents legacy active profiles from bypassing the
 * public Hero requirements.
 */
export function getPortfolioPublicationState(
  profile: Pick<DesignerProfileRecord, 'status' | 'logoImageId' | 'displayName' | 'bio'>,
  portfolio: Pick<
    PortfolioRecord,
    'heroImageId' | 'publicLinkEnabled' | 'showHero' | 'tagline'
  > | null,
): { publiclyVisible: boolean; missingRequiredFields: RequiredPortfolioField[] } {
  const missing = missingRequiredFields(profile, portfolio);
  // Existing active portfolios predate dedicated covers. Keep them public while
  // surfacing the missing cover in settings, but require every new draft to add
  // one before activation. The public Hero never falls back to a project image.
  const blockingMissing =
    profile.status === 'active' ? missing.filter((field) => field !== 'heroCover') : missing;
  return {
    publiclyVisible:
      profile.status === 'active' &&
      (portfolio?.publicLinkEnabled ?? true) &&
      blockingMissing.length === 0,
    missingRequiredFields: missing,
  };
}

/**
 * Promote a draft profile whose required fields are now filled.
 *
 * Mutates `profile.status` in place so the caller's response (and the `verified`
 * badge computed from it) reflects the transition without a re-read.
 */
async function activateIfComplete(
  tx: Tx,
  profile: DesignerProfileRecord,
  portfolio: PortfolioRecord,
): Promise<void> {
  if (profile.status !== 'draft') return;
  if (missingRequiredFields(profile, portfolio).length > 0) return;

  const activated = await portfolioRepository.activateIfDraftInTx(tx, profile.id);
  if (activated) profile.status = 'active';
}

export async function resolveProfile(caller: Caller): Promise<DesignerProfileRecord> {
  if (!caller.activeOrgId) {
    throw AppError.unprocessable('No active organization selected');
  }
  const canWrite = await orgsService.hasCapability(
    caller.userId,
    caller.activeOrgId,
    ORGANIZATION_CAPABILITY.EDIT_ORGANIZATION,
  );
  if (!canWrite) {
    throw AppError.forbidden('Insufficient org role to manage portfolio');
  }
  if (!caller.activeTeamId) {
    throw AppError.unprocessable('No active branch selected');
  }
  const profile = await profilesRepository.findByTeamId(caller.activeTeamId);
  if (!profile) {
    throw AppError.notFound('No designer profile found for the active branch');
  }
  if (profile.orgId !== caller.activeOrgId) {
    throw AppError.forbidden('Active branch does not belong to the active organization');
  }
  return profile;
}

/**
 * Assemble the contract response from a profile + portfolio row pair.
 * Presigns the logo download URL (single storage round-trip).
 */
async function buildPortfolioResponse(
  profile: DesignerProfileRecord,
  portfolio: PortfolioRecord,
): Promise<PortfolioResponse> {
  // Independent reads — one round-trip's worth of latency, not three.
  const [logoUrl, heroCoverUrl, logoSourceUrl, googleRow, isKycVerified] = await Promise.all([
    presignProfileLogo(profile),
    presignPortfolioHeroCover(profile.id, portfolio),
    presignProfileLogoSource(profile),
    // Lightweight Google connection snapshot so the settings page renders the
    // real connection state (badge + rating) without a second request.
    googleReviewsRepository.findByProfileId(profile.id),
    profilesRepository.isOrganizationKycVerified(profile.orgId),
  ]);
  const badges = computeBadges(profile, isKycVerified);

  const googleConnection = googleRow ? readState(googleRow).summary : null;
  const portfolioUrl = publicPortfolioUrl(portfolio.portfolioSlug, profile.slug);
  const publication = getPortfolioPublicationState(profile, portfolio);

  return {
    id: portfolio.id,
    publicLinkEnabled: portfolio.publicLinkEnabled,
    portfolioSlug: portfolio.portfolioSlug,
    accentColor: portfolio.accentColor,
    showHero: portfolio.showHero,
    showTrustCredentials: portfolio.showTrustCredentials,
    showFeaturedTestimonial: portfolio.showFeaturedTestimonial,
    showReviews: portfolio.showTickifReviews || portfolio.showGoogleReviews,
    showSocialLinks: portfolio.showSocialLinks,
    showShareBlock: portfolio.showShareBlock,
    tagline: portfolio.tagline,
    displayName: profile.displayName,
    bio: profile.bio,
    logoUrl,
    heroCoverUrl,
    logoSourceUrl,
    logoCrop: profile.logoCrop,
    websiteUrl: profile.websiteUrl,
    instagramHandle: profile.instagramHandle,
    linkedinHandle: profile.linkedinHandle,
    youtubeHandle: profile.youtubeHandle,
    testimonialWords: portfolio.testimonialWords,
    testimonialAuthor: portfolio.testimonialAuthor,
    testimonialProjectId: portfolio.testimonialProjectId,
    showOverallRating: portfolio.showTickifOverallRating || portfolio.showGoogleOverallRating,
    showPositiveReviewsOnly:
      portfolio.showTickifPositiveReviewsOnly && portfolio.showGooglePositiveReviewsOnly,
    reviewSettings: {
      tickif: {
        showReviews: portfolio.showTickifReviews,
        showOverallRating: portfolio.showTickifOverallRating,
        showPositiveReviewsOnly: portfolio.showTickifPositiveReviewsOnly,
      },
      google: {
        showReviews: portfolio.showGoogleReviews,
        showOverallRating: portfolio.showGoogleOverallRating,
        showPositiveReviewsOnly: portfolio.showGooglePositiveReviewsOnly,
      },
    },
    showTickifBadge: portfolio.showTickifBadge,
    badges,
    isKycVerified,
    portfolioUrl,
    publiclyVisible: publication.publiclyVisible,
    missingRequiredFields: publication.missingRequiredFields,
    googleConnection,
    experienceCenters: portfolio.experienceCenters,
    publishedAt: portfolio.publishedAt?.toISOString() ?? null,
    createdAt: portfolio.createdAt.toISOString(),
    updatedAt: portfolio.updatedAt.toISOString(),
  };
}

export const portfolioService = {
  /**
   * GET portfolio. Creates default row if missing (atomic upsert to handle races).
   * Returns merged data from designer_portfolio + designer_profile.
   */
  async getPortfolio(caller: Caller): Promise<PortfolioResponse> {
    const profile = await resolveProfile(caller);

    // Non-mutating find-or-create: avoids touching updatedAt on every GET
    const portfolio = await portfolioRepository.findOrCreate(profile.id);

    return buildPortfolioResponse(profile, portfolio);
  },

  /**
   * PATCH portfolio. Validates slug uniqueness and testimonial ownership.
   * All validations and writes run inside a single database transaction.
   */
  async updatePortfolio(input: UpdatePortfolioInput, caller: Caller): Promise<PortfolioResponse> {
    const profile = await resolveProfile(caller);

    const portfolio = await withTransaction(async (tx: Tx) => {
      // Ensure portfolio row exists without bumping updatedAt (non-mutating)
      let row = await portfolioRepository.findOrCreateInTx(tx, profile.id);

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

      // Once a mandatory Hero value has been saved, later edits may replace it
      // but cannot clear it. Apply this per field even while the rest of a draft
      // portfolio is incomplete, and reject before either table is written.
      const clearsSavedRequiredField =
        (displayName !== undefined &&
          isNonBlank(profile.displayName) &&
          !isNonBlank(displayName)) ||
        (bio !== undefined && isNonBlank(profile.bio) && !isNonBlank(bio)) ||
        (portfolioFields.tagline !== undefined &&
          isNonBlank(row.tagline) &&
          !isNonBlank(portfolioFields.tagline));
      if (clearsSavedRequiredField) {
        throw AppError.unprocessable('Required Hero fields cannot be empty once saved');
      }

      // Update profile fields if any provided (inside transaction)
      const profileUpdates: Partial<
        Pick<
          DesignerProfileRecord,
          | 'displayName'
          | 'bio'
          | 'websiteUrl'
          | 'instagramHandle'
          | 'linkedinHandle'
          | 'youtubeHandle'
        >
      > = {};
      if (displayName !== undefined) profileUpdates.displayName = displayName;
      if (bio !== undefined) profileUpdates.bio = bio;
      if (websiteUrl !== undefined) profileUpdates.websiteUrl = websiteUrl;
      if (instagramHandle !== undefined) profileUpdates.instagramHandle = instagramHandle;
      if (linkedinHandle !== undefined) profileUpdates.linkedinHandle = linkedinHandle;
      if (youtubeHandle !== undefined) profileUpdates.youtubeHandle = youtubeHandle;

      if (Object.keys(profileUpdates).length > 0) {
        await portfolioRepository.updateProfileInTx(tx, profile.id, profileUpdates);
        // Keep the in-memory profile in sync so the response reflects the update
        Object.assign(profile, profileUpdates);
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
      if (portfolioFields.showReviews !== undefined) {
        portfolioPatch.showTickifReviews = portfolioFields.showReviews;
        portfolioPatch.showGoogleReviews = portfolioFields.showReviews;
      }
      if (portfolioFields.showSocialLinks !== undefined)
        portfolioPatch.showSocialLinks = portfolioFields.showSocialLinks;
      if (portfolioFields.showShareBlock !== undefined)
        portfolioPatch.showShareBlock = portfolioFields.showShareBlock;
      if (portfolioFields.tagline !== undefined) portfolioPatch.tagline = portfolioFields.tagline;
      if (portfolioFields.testimonialWords !== undefined)
        portfolioPatch.testimonialWords = portfolioFields.testimonialWords;
      if (portfolioFields.testimonialAuthor !== undefined)
        portfolioPatch.testimonialAuthor = portfolioFields.testimonialAuthor;
      if (portfolioFields.testimonialProjectId !== undefined) {
        portfolioPatch.testimonialProjectId = portfolioFields.testimonialProjectId;
        portfolioPatch.testimonialUpdatedAt = new Date();
      }
      if (portfolioFields.showOverallRating !== undefined) {
        portfolioPatch.showOverallRating = portfolioFields.showOverallRating;
        portfolioPatch.showTickifOverallRating = portfolioFields.showOverallRating;
        portfolioPatch.showGoogleOverallRating = portfolioFields.showOverallRating;
      }
      if (portfolioFields.showPositiveReviewsOnly !== undefined) {
        portfolioPatch.showPositiveReviewsOnly = portfolioFields.showPositiveReviewsOnly;
        portfolioPatch.showTickifPositiveReviewsOnly = portfolioFields.showPositiveReviewsOnly;
        portfolioPatch.showGooglePositiveReviewsOnly = portfolioFields.showPositiveReviewsOnly;
      }
      if (portfolioFields.reviewSettings?.tickif?.showReviews !== undefined) {
        portfolioPatch.showTickifReviews = portfolioFields.reviewSettings.tickif.showReviews;
      }
      if (portfolioFields.reviewSettings?.tickif?.showOverallRating !== undefined) {
        portfolioPatch.showTickifOverallRating =
          portfolioFields.reviewSettings.tickif.showOverallRating;
      }
      if (portfolioFields.reviewSettings?.tickif?.showPositiveReviewsOnly !== undefined) {
        portfolioPatch.showTickifPositiveReviewsOnly =
          portfolioFields.reviewSettings.tickif.showPositiveReviewsOnly;
      }
      if (portfolioFields.reviewSettings?.google?.showReviews !== undefined) {
        portfolioPatch.showGoogleReviews = portfolioFields.reviewSettings.google.showReviews;
      }
      if (portfolioFields.reviewSettings?.google?.showOverallRating !== undefined) {
        portfolioPatch.showGoogleOverallRating =
          portfolioFields.reviewSettings.google.showOverallRating;
      }
      if (portfolioFields.reviewSettings?.google?.showPositiveReviewsOnly !== undefined) {
        portfolioPatch.showGooglePositiveReviewsOnly =
          portfolioFields.reviewSettings.google.showPositiveReviewsOnly;
      }
      if (portfolioFields.showTickifBadge !== undefined)
        portfolioPatch.showTickifBadge = portfolioFields.showTickifBadge;
      if (portfolioFields.experienceCenters !== undefined)
        portfolioPatch.experienceCenters = portfolioFields.experienceCenters;

      if (Object.keys(portfolioPatch).length > 0) {
        try {
          row = await portfolioRepository.upsertInTx(tx, profile.id, portfolioPatch);
        } catch (err: unknown) {
          if (isUniqueViolation(err, 'designer_portfolio_portfolio_slug_unique')) {
            throw AppError.conflict('This portfolio slug is already taken');
          }
          throw err;
        }
      }

      // Same transaction as the writes above, so a save that completes the hero
      // can never commit the fields but lose the activation.
      await activateIfComplete(tx, profile, row);

      return row;
    });

    // Emit audit event (fire-and-forget, AFTER commit — not inside transaction).
    // Skipped for no-op requests where nothing was provided.
    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof typeof input] !== undefined,
    );
    if (changedFields.length > 0) {
      emitAuditEvent({
        userId: caller.userId,
        activeOrgId: caller.activeOrgId!,
        action: 'portfolio.updated',
        timestamp: new Date().toISOString(),
        resourceId: profile.id,
        changedFields,
      });
    }

    // Assemble the response from data already in hand (fresh row from the
    // transaction + profile with in-memory updates applied) — avoids re-running
    // the auth/profile/portfolio lookups that getPortfolio would repeat.
    return buildPortfolioResponse(profile, portfolio);
  },

  /** Check slug availability for the current designer. */
  async checkSlugAvailability(slug: string, caller: Caller): Promise<SlugAvailabilityResponse> {
    const profile = await resolveProfile(caller);

    if (portfolioRepository.isReservedSlug(slug)) {
      return { slug, available: false };
    }

    const available = await portfolioRepository.isSlugAvailable(slug, profile.id);
    return { slug, available };
  },

  /** Mint a presigned upload URL for a logo image. */
  async createLogoUploadUrl(
    input: { contentType: string; contentLength: number; variant?: 'display' | 'source' },
    caller: Caller,
  ): Promise<{ uploadUrl: string; key: string }> {
    const profile = await resolveProfile(caller);

    // Defense-in-depth: validate content type even though Zod contract already checks
    if (!ALLOWED_LOGO_CONTENT_TYPES.has(input.contentType)) {
      throw AppError.unprocessable('Unsupported content type for logo upload');
    }

    const sizeLimit = input.variant === 'source' ? MAX_SOURCE_LOGO_BYTES : MAX_DISPLAY_LOGO_BYTES;
    if (input.contentLength > sizeLimit) {
      throw AppError.unprocessable('Declared size exceeds the logo size limit');
    }

    const key = `originals/logos/${profile.id}/${randomUUID()}`;
    const reserved = await portfolioRepository.reserveLogoUpload(
      profile.id,
      key,
      new Date(Date.now() + config.R2_UPLOAD_URL_EXPIRY_SECONDS * 1_000),
    );
    if (!reserved) throw AppError.conflict('Organization is no longer accepting uploads');
    let uploadUrl: string;
    try {
      uploadUrl = await presignUpload({
        key,
        contentType: input.contentType,
        contentLength: input.contentLength,
      });
    } catch (error) {
      await portfolioRepository.releaseUploadLease(key).catch(() => undefined);
      throw error;
    }

    return { uploadUrl, key };
  },

  /** Mint a presigned upload URL for the dedicated portfolio Hero cover. */
  async createHeroCoverUploadUrl(
    input: { contentType: string; contentLength: number },
    caller: Caller,
  ): Promise<{ uploadUrl: string; key: string }> {
    const profile = await resolveProfile(caller);

    if (!ALLOWED_HERO_COVER_CONTENT_TYPES.has(input.contentType)) {
      throw AppError.unprocessable('Unsupported content type for portfolio cover upload');
    }
    if (input.contentLength > MAX_HERO_COVER_BYTES) {
      throw AppError.unprocessable('Declared size exceeds the portfolio cover size limit');
    }

    const key = `originals/portfolio-covers/${profile.id}/${randomUUID()}`;
    const reserved = await portfolioRepository.reserveLogoUpload(
      profile.id,
      key,
      new Date(Date.now() + config.R2_UPLOAD_URL_EXPIRY_SECONDS * 1_000),
    );
    if (!reserved) throw AppError.conflict('Organization is no longer accepting uploads');

    try {
      const uploadUrl = await presignUpload({
        key,
        contentType: input.contentType,
        contentLength: input.contentLength,
      });
      return { uploadUrl, key };
    } catch (error) {
      await portfolioRepository.releaseUploadLease(key).catch(() => undefined);
      throw error;
    }
  },

  /** Confirm and atomically associate a dedicated portfolio Hero cover. */
  async commitHeroCoverUpload(
    input: { objectKey: string },
    caller: Caller,
  ): Promise<{ heroCoverUrl: string }> {
    const profile = await resolveProfile(caller);
    const expectedPrefix = `originals/portfolio-covers/${profile.id}/`;
    if (!input.objectKey.startsWith(expectedPrefix)) {
      throw AppError.forbidden('Object key does not belong to this profile');
    }
    if (!(await objectExists(input.objectKey))) {
      throw AppError.badRequest('No uploaded object found for this image');
    }

    let portfolio = await portfolioRepository.findOrCreate(profile.id);
    const previousKey = portfolio.heroImageId;
    let updated = await portfolioRepository.setHeroImageIfMatch(
      profile.id,
      previousKey,
      input.objectKey,
    );
    if (!updated) {
      portfolio = await portfolioRepository.findOrCreate(profile.id);
      updated = await portfolioRepository.setHeroImageIfMatch(
        profile.id,
        portfolio.heroImageId,
        input.objectKey,
      );
      if (!updated) {
        throw AppError.conflict('Portfolio cover was modified concurrently, please retry');
      }
    }

    const updatedPortfolio = { ...portfolio, heroImageId: input.objectKey };
    if (
      profile.status === 'draft' &&
      missingRequiredFields(profile, updatedPortfolio).length === 0
    ) {
      await portfolioRepository.activateIfDraft(profile.id);
    }

    if (previousKey && previousKey !== input.objectKey && previousKey.startsWith(expectedPrefix)) {
      try {
        await deleteObject(previousKey);
      } catch (err) {
        console.error('[commitHeroCoverUpload] Failed to delete previous cover:', err);
      }
    }

    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.hero_cover_uploaded',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
    });

    return { heroCoverUrl: await presignDownload({ key: input.objectKey }) };
  },

  /** Confirm a logo was uploaded and persist the association. */
  async commitLogoUpload(
    input: { objectKey: string; sourceObjectKey?: string; logoCrop?: LogoCropArea },
    caller: Caller,
  ): Promise<{
    logoUrl: string;
    logoSourceUrl: string | null;
    logoCrop: LogoCropArea | null;
  }> {
    const profile = await resolveProfile(caller);

    // Validate that the key belongs to this profile (prevent cross-profile attachment)
    const expectedPrefix = `originals/logos/${profile.id}/`;
    if (!input.objectKey.startsWith(expectedPrefix)) {
      throw AppError.forbidden('Object key does not belong to this profile');
    }
    if (input.sourceObjectKey && !input.sourceObjectKey.startsWith(expectedPrefix)) {
      throw AppError.forbidden('Source object key does not belong to this profile');
    }

    const [displayExists, sourceExists] = await Promise.all([
      objectExists(input.objectKey),
      input.sourceObjectKey ? objectExists(input.sourceObjectKey) : Promise.resolve(true),
    ]);
    if (!displayExists) {
      throw AppError.badRequest('No uploaded object found for this image');
    }
    if (!sourceExists) {
      throw AppError.badRequest('No uploaded object found for the source image');
    }

    // Compare-and-set: atomically swap logoImageId only if current value matches what we read
    const previousKey = profile.logoImageId;
    const previousSourceKey = profile.logoSourceImageId;
    const nextLogoCrop = input.logoCrop ?? null;
    // Before source tracking existed, the displayed image is the crop editor's
    // original. Keep it so saved percentages still refer to the same pixels.
    const cropSourceKey = previousSourceKey ?? (input.logoCrop ? previousKey : null);
    let nextSourceKey = input.sourceObjectKey ?? cropSourceKey;
    const updated = await portfolioRepository.setLogoIfMatch(
      profile.id,
      previousKey,
      input.objectKey,
      nextSourceKey,
      nextLogoCrop,
    );
    if (!updated) {
      // Concurrent modification — retry CAS once with fresh state
      const freshProfile = await resolveProfile(caller);
      const freshSourceKey =
        freshProfile.logoSourceImageId ?? (input.logoCrop ? freshProfile.logoImageId : null);
      if (!input.sourceObjectKey && input.logoCrop && freshSourceKey !== cropSourceKey) {
        throw AppError.conflict('Logo source was modified concurrently, please reopen the editor');
      }
      nextSourceKey = input.sourceObjectKey ?? freshSourceKey;
      const retried = await portfolioRepository.setLogoIfMatch(
        freshProfile.id,
        freshProfile.logoImageId,
        input.objectKey,
        nextSourceKey,
        nextLogoCrop,
      );
      if (!retried) {
        throw AppError.conflict('Logo was modified concurrently, please retry');
      }
    }
    profile.logoImageId = input.objectKey;
    profile.logoSourceImageId = nextSourceKey;
    profile.logoCrop = nextLogoCrop;

    // The logo is a required field, so this upload may be what takes the
    // portfolio live. Kept out of the CAS transaction: a failure here must not
    // roll back a logo that is already committed and in storage — the next save
    // re-evaluates the same condition.
    if (profile.status === 'draft') {
      const portfolio = await portfolioRepository.findOrCreate(profile.id);
      if (missingRequiredFields(profile, portfolio).length === 0) {
        await portfolioRepository.activateIfDraft(profile.id);
      }
    }

    // Clean up the previous storage object (non-critical — orphan is acceptable)
    if (
      previousKey &&
      previousKey !== input.objectKey &&
      previousKey !== nextSourceKey &&
      previousKey.startsWith(expectedPrefix)
    ) {
      try {
        await deleteObject(previousKey);
      } catch (err) {
        console.error('[commitLogoUpload] Failed to delete previous logo:', err);
      }
    }
    if (
      input.sourceObjectKey &&
      previousSourceKey &&
      previousSourceKey !== input.sourceObjectKey &&
      previousSourceKey !== previousKey &&
      previousSourceKey.startsWith(expectedPrefix)
    ) {
      try {
        await deleteObject(previousSourceKey);
      } catch (err) {
        console.error('[commitLogoUpload] Failed to delete previous logo source:', err);
      }
    }

    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.logo_uploaded',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
    });

    const [logoUrl, logoSourceUrl] = await Promise.all([
      presignDownload({ key: input.objectKey }),
      nextSourceKey ? presignDownload({ key: nextSourceKey }) : Promise.resolve(null),
    ]);

    return { logoUrl, logoSourceUrl, logoCrop: nextLogoCrop };
  },

  /** Delete the current logo from storage and clear the DB association. */
  async deleteLogo(caller: Caller): Promise<void> {
    const profile = await resolveProfile(caller);

    if (!profile.logoImageId) {
      throw AppError.notFound('No logo exists to delete');
    }
    const keyToDelete = profile.logoImageId;

    // Validate prefix before allowing delete (prevent IDOR)
    const expectedPrefix = `originals/logos/${profile.id}/`;
    if (!keyToDelete.startsWith(expectedPrefix)) {
      throw AppError.forbidden('Cannot delete logo: invalid key ownership');
    }

    throw AppError.unprocessable(
      'Upload a replacement before removing the logo from your saved portfolio',
    );
  },
};
