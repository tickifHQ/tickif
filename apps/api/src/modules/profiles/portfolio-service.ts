import type {
  PortfolioBadge,
  PortfolioResponse,
  RequiredPortfolioField,
  UpdatePortfolioInput,
  SlugAvailabilityResponse,
} from '@repo/contracts';
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
};

const ALLOWED_LOGO_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

const MAX_LOGO_BYTES = 5_000_000;

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
  action: 'portfolio.updated' | 'portfolio.logo_uploaded' | 'portfolio.logo_deleted';
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
export function publicPortfolioSlug(
  portfolioSlug: string | null,
  orgSlug: string,
): string {
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
export async function presignProfileLogo(
  profile: DesignerProfileRecord,
): Promise<string | null> {
  const expectedPrefix = `originals/logos/${profile.id}/`;
  if (!profile.logoImageId || !profile.logoImageId.startsWith(expectedPrefix)) return null;
  return presignDownload({ key: profile.logoImageId });
}

export function computeBadges(profile: DesignerProfileRecord): PortfolioBadge[] {
  const badges: PortfolioBadge[] = [];
  if (profile.status === 'active') badges.push('verified');
  const daysSinceCreation =
    (Date.now() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation < BADGE_NEW_DAYS) badges.push('new');
  if (Number(profile.avgRating) >= BADGE_TOP_PERFORMER_RATING && profile.reviewCount >= BADGE_TOP_PERFORMER_REVIEWS)
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
  portfolio: Pick<PortfolioRecord, 'tagline'>,
): RequiredPortfolioField[] {
  const filled = (value: string | null): boolean => !!value && value.trim().length > 0;
  const missing: RequiredPortfolioField[] = [];
  if (!filled(profile.logoImageId)) missing.push('logo');
  if (!filled(profile.displayName)) missing.push('displayName');
  if (!filled(portfolio.tagline)) missing.push('tagline');
  if (!filled(profile.bio)) missing.push('bio');
  return missing;
}

/**
 * Promote a draft profile whose required fields are now filled.
 *
 * Deliberately one-way: clearing a field later does **not** hide a live
 * portfolio. Un-publishing has a wide blast radius — the public page 404s, the
 * designer's projects drop out of the feed, and the search document is removed —
 * so taking a portfolio offline stays an explicit act via `publicLinkEnabled`
 * rather than a side effect of editing a field.
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
  const canWrite = await orgsService.isWriter(caller.userId, caller.activeOrgId);
  if (!canWrite) {
    throw AppError.forbidden('Insufficient org role to manage portfolio');
  }
  const profile = await profilesRepository.findByOrgId(caller.activeOrgId);
  if (!profile) {
    throw AppError.notFound('No designer profile found for the active organization');
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
  const badges = computeBadges(profile);

  // Independent reads — one round-trip's worth of latency, not three.
  const [logoUrl, googleRow, orgSlug] = await Promise.all([
    presignProfileLogo(profile),
    // Lightweight Google connection snapshot so the settings page renders the
    // real connection state (badge + rating) without a second request.
    googleReviewsRepository.findByProfileId(profile.id),
    portfolioRepository.findOrgSlug(profile.orgId),
  ]);

  const googleConnection = googleRow ? readState(googleRow).summary : null;
  // Null only if the owning org vanished mid-request; the FK makes that a no-op case.
  const portfolioUrl = orgSlug ? publicPortfolioUrl(portfolio.portfolioSlug, orgSlug) : null;

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
    logoUrl,
    websiteUrl: profile.websiteUrl,
    instagramHandle: profile.instagramHandle,
    linkedinHandle: profile.linkedinHandle,
    youtubeHandle: profile.youtubeHandle,
    testimonialWords: portfolio.testimonialWords,
    testimonialAuthor: portfolio.testimonialAuthor,
    testimonialProjectId: portfolio.testimonialProjectId,
    showOverallRating: portfolio.showOverallRating,
    showPositiveReviewsOnly: portfolio.showPositiveReviewsOnly,
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
    portfolioUrl,
    // `publiclyVisible` answers "does /d/{slug} serve a page right now?", so it
    // carries the designer's own switch as well as the completeness gate.
    publiclyVisible: profile.status === 'active' && portfolio.publicLinkEnabled,
    missingRequiredFields: missingRequiredFields(profile, portfolio),
    googleConnection,
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
  async updatePortfolio(
    input: UpdatePortfolioInput,
    caller: Caller,
  ): Promise<PortfolioResponse> {
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
      if (portfolioFields.showOverallRating !== undefined) {
        portfolioPatch.showOverallRating = portfolioFields.showOverallRating;
        portfolioPatch.showTickifOverallRating = portfolioFields.showOverallRating;
        portfolioPatch.showGoogleOverallRating = portfolioFields.showOverallRating;
      }
      if (portfolioFields.showPositiveReviewsOnly !== undefined) {
        portfolioPatch.showPositiveReviewsOnly = portfolioFields.showPositiveReviewsOnly;
        portfolioPatch.showTickifPositiveReviewsOnly =
          portfolioFields.showPositiveReviewsOnly;
        portfolioPatch.showGooglePositiveReviewsOnly =
          portfolioFields.showPositiveReviewsOnly;
      }
      if (portfolioFields.reviewSettings?.tickif?.showReviews !== undefined) {
        portfolioPatch.showTickifReviews =
          portfolioFields.reviewSettings.tickif.showReviews;
      }
      if (portfolioFields.reviewSettings?.tickif?.showOverallRating !== undefined) {
        portfolioPatch.showTickifOverallRating =
          portfolioFields.reviewSettings.tickif.showOverallRating;
      }
      if (
        portfolioFields.reviewSettings?.tickif?.showPositiveReviewsOnly !== undefined
      ) {
        portfolioPatch.showTickifPositiveReviewsOnly =
          portfolioFields.reviewSettings.tickif.showPositiveReviewsOnly;
      }
      if (portfolioFields.reviewSettings?.google?.showReviews !== undefined) {
        portfolioPatch.showGoogleReviews =
          portfolioFields.reviewSettings.google.showReviews;
      }
      if (portfolioFields.reviewSettings?.google?.showOverallRating !== undefined) {
        portfolioPatch.showGoogleOverallRating =
          portfolioFields.reviewSettings.google.showOverallRating;
      }
      if (
        portfolioFields.reviewSettings?.google?.showPositiveReviewsOnly !== undefined
      ) {
        portfolioPatch.showGooglePositiveReviewsOnly =
          portfolioFields.reviewSettings.google.showPositiveReviewsOnly;
      }
      if (portfolioFields.showTickifBadge !== undefined)
        portfolioPatch.showTickifBadge = portfolioFields.showTickifBadge;

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

    // Validate that the key belongs to this profile (prevent cross-profile attachment)
    const expectedPrefix = `originals/logos/${profile.id}/`;
    if (!input.objectKey.startsWith(expectedPrefix)) {
      throw AppError.forbidden('Object key does not belong to this profile');
    }

    const exists = await objectExists(input.objectKey);
    if (!exists) {
      throw AppError.badRequest('No uploaded object found for this image');
    }

    // Compare-and-set: atomically swap logoImageId only if current value matches what we read
    const previousKey = profile.logoImageId;
    const updated = await portfolioRepository.setLogoIfMatch(
      profile.id,
      previousKey,
      input.objectKey,
    );
    if (!updated) {
      // Concurrent modification — retry CAS once with fresh state
      const freshProfile = await resolveProfile(caller);
      const retried = await portfolioRepository.setLogoIfMatch(
        freshProfile.id,
        freshProfile.logoImageId,
        input.objectKey,
      );
      if (!retried) {
        throw AppError.conflict('Logo was modified concurrently, please retry');
      }
    }
    profile.logoImageId = input.objectKey;

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
    if (previousKey && previousKey !== input.objectKey && previousKey.startsWith(expectedPrefix)) {
      try {
        await deleteObject(previousKey);
      } catch (err) {
        console.error('[commitLogoUpload] Failed to delete previous logo:', err);
      }
    }

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

  /**
   * Delete the current logo from storage and clear the DB association.
   *
   * Does not demote an already-live portfolio — see `activateIfComplete`.
   */
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

    // Compare-and-set: only clear if logoImageId hasn't changed since we read it
    const updated = await portfolioRepository.clearLogoIfMatch(profile.id, keyToDelete);
    if (!updated) {
      // Another request already changed or cleared the logo — nothing to do
      return;
    }

    // Best-effort storage cleanup (orphan is acceptable if this fails)
    try {
      await deleteObject(keyToDelete);
    } catch (err) {
      console.error('[deleteLogo] Storage cleanup failed (orphan left):', err);
    }

    emitAuditEvent({
      userId: caller.userId,
      activeOrgId: caller.activeOrgId!,
      action: 'portfolio.logo_deleted',
      timestamp: new Date().toISOString(),
      resourceId: profile.id,
    });
  },
};
