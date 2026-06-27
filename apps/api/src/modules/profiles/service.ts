import crypto from 'node:crypto';
import type {
  CompletionStep,
  ProfileCompletionResponse,
  OnboardDesignerInput,
  OnboardDesignerResponse,
  ProfilePublicResponse,
  ProfileOwnerResponse,
  UpdateProfileInput,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { profilesRepository, type DesignerProfileRecord } from './repository.js';
import { isOrgWriter } from '../orgs/repository.js';

/**
 * Profile completion use-cases. Business logic lives here — no Hono, no Drizzle.
 *
 * The completion response powers the designer-dashboard onboarding checklist.
 *
 * Important distinction:
 * - `steps` = onboarding checklist (broad lifecycle steps for the UI)
 * - `score` = profile field completion percentage (name, bio, city, scope, logo, contact)
 * - `missing` = which profile fields are still incomplete
 */

/** Minimum score (0–100) to pass the publishing gate. */
const COMPLETION_THRESHOLD = 60;

/** The required profile fields that drive the completion score. */
const REQUIRED_FIELDS = ['display-name', 'bio', 'logo', 'location', 'scope', 'contact'] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

type CompletionInput = {
  userId: string;
  orgId: string | null;
};

type FieldCheckResult = {
  filled: RequiredField[];
  missing: RequiredField[];
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  );
}

export const profilesService = {
  // --- Onboarding (E-35) ---

  async onboardDesigner(
    userId: string,
    input: OnboardDesignerInput,
  ): Promise<{ data: OnboardDesignerResponse; created: boolean }> {
    // 1. Idempotency: check if user already onboarded
    const existing = await profilesRepository.findByUserId(userId);
    if (existing) {
      return {
        data: {
          profile: {
            id: existing.profile.id,
            orgId: existing.profile.orgId,
            displayName: existing.profile.displayName,
            entityType: existing.profile.entityType,
            status: existing.profile.status,
            createdAt: existing.profile.createdAt.toISOString(),
          },
          organization: {
            id: existing.org.id,
            name: existing.org.name,
            slug: existing.org.slug,
          },
        },
        created: false,
      };
    }

    // 2. Validate taxonomy IDs (single round-trip, deduped)
    const taxonomyErrors = await profilesRepository.validateAllTaxonomyIds({
      scopeIds: input.scopeIds.length > 0 ? input.scopeIds : undefined,
      themeIds: input.themeIds.length > 0 ? input.themeIds : undefined,
    });
    if (taxonomyErrors.length > 0) {
      throw AppError.unprocessable(taxonomyErrors.join('; '));
    }

    // 4. Derive org and profile fields
    const orgName =
      input.entityType === 'company' ? input.companyName! : input.userName;
    const displayName = orgName;
    const orgSlug = `${slugify(orgName)}-${crypto.randomUUID().slice(0, 6)}`;
    const orgId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    const footprintIds = [
      ...new Set([...input.scopeIds, ...input.themeIds]),
    ].map((id) => ({ taxonomyId: id }));

    // 5. Execute transaction — catch unique violation for race-safe idempotency
    try {
      const { profile, org } = await profilesRepository.onboard({
        orgId,
        orgName,
        orgSlug,
        memberId,
        userId,
        displayName,
        entityType: input.entityType,
        bio: input.bio ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        websiteUrl: input.websiteUrl ?? null,
        googleBusinessUrl: input.googleBusinessUrl ?? null,
        instagramHandle: input.instagramHandle ?? null,
        linkedinHandle: input.linkedinHandle ?? null,
        youtubeHandle: input.youtubeHandle ?? null,
        firmType: input.firmType ?? null,
        foundedYear: input.foundedYear ?? null,
        staffCount: input.staffCount ?? null,
        footprintIds,
      });

      return {
        data: {
          profile: {
            id: profile.id,
            orgId: profile.orgId,
            displayName: profile.displayName,
            entityType: profile.entityType,
            status: profile.status,
            createdAt: profile.createdAt.toISOString(),
          },
          organization: {
            id: org.id,
            name: org.name,
            slug: org.slug,
          },
        },
        created: true,
      };
    } catch (err: unknown) {
      // Race condition: concurrent request already created the profile.
      // Partial unique index designer_profile_user_id_unique catches this.
      const isUniqueViolation =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === '23505' &&
        'constraint' in err &&
        err.constraint === 'designer_profile_user_id_unique';
      if (isUniqueViolation) {
        const existing = await profilesRepository.findByUserId(userId);
        if (existing) {
          return {
            data: {
              profile: {
                id: existing.profile.id,
                orgId: existing.profile.orgId,
                displayName: existing.profile.displayName,
                entityType: existing.profile.entityType,
                status: existing.profile.status,
                createdAt: existing.profile.createdAt.toISOString(),
              },
              organization: {
                id: existing.org.id,
                name: existing.org.name,
                slug: existing.org.slug,
              },
            },
            created: false,
          };
        }
      }
      throw err;
    }
  },

  // --- Completion (E-36) ---

  async getCompletion(input: CompletionInput): Promise<ProfileCompletionResponse> {
    // Resolve orgId if not provided
    const orgId = input.orgId ?? (await profilesRepository.hasOrganization(input.userId));

    // Fetch profile ONCE and thread through (avoids duplicate DB hits)
    const profile = orgId ? await profilesRepository.findByOrgId(orgId) : null;

    // Parallelize independent reads
    const [hasGoogle, hasProject, fieldCheck] = await Promise.all([
      profilesRepository.hasGoogleAccount(input.userId),
      profile ? profilesRepository.hasProject(profile.id) : Promise.resolve(false),
      this._checkProfileFields(input.userId, profile),
    ]);

    // Build steps
    const steps: CompletionStep[] = [
      {
        key: 'signed-in-with-google',
        label: 'Sign in with Google',
        done: hasGoogle,
      },
      {
        key: 'org-created',
        label: 'Create your organization',
        done: !!orgId,
      },
      {
        key: 'profile-completed',
        label: 'Complete your profile',
        done: fieldCheck.missing.length === 0,
      },
      {
        key: 'first-project-uploaded',
        label: 'Upload your first project',
        done: hasProject,
      },
    ];

    // Score is based on profile FIELDS, not steps
    const score = Math.round(
      (fieldCheck.filled.length / REQUIRED_FIELDS.length) * 100,
    );

    return { steps, score, missing: fieldCheck.missing };
  },

  /**
   * Gating helper for the publishing flow. Returns pass: true if score meets
   * threshold, or a reason string explaining what's missing.
   */
  async isComplete(input: CompletionInput): Promise<{ pass: boolean; reason?: string }> {
    const result = await profilesService.getCompletion(input);
    if (result.score >= COMPLETION_THRESHOLD) {
      return { pass: true };
    }
    return {
      pass: false,
      reason: `Profile completion ${result.score}% is below the required ${COMPLETION_THRESHOLD}%. Missing: ${result.missing.join(', ')}`,
    };
  },

  /**
   * Check which required profile fields are filled vs missing.
   * Accepts an already-fetched profile to avoid redundant DB queries.
   */
  async _checkProfileFields(
    userId: string,
    profile: DesignerProfileRecord | null,
  ): Promise<FieldCheckResult> {
    if (!profile) {
      return { filled: [], missing: [...REQUIRED_FIELDS] };
    }

    // Parallelize the async checks (scope count, contact)
    const [cityCount, scopeCount, hasContact] = await Promise.all([
      profilesRepository.countFootprintByKind(profile.id, 'city'),
      profilesRepository.countFootprintByKind(profile.id, 'scope'),
      profilesRepository.hasContact(userId),
    ]);

    const filled: RequiredField[] = [];
    const missing: RequiredField[] = [];

    if (profile.displayName.trim().length > 0) filled.push('display-name');
    else missing.push('display-name');

    if (profile.bio) filled.push('bio');
    else missing.push('bio');

    if (profile.logoImageId) filled.push('logo');
    else missing.push('logo');

    // Location: satisfied by free-text address (onboarding) OR city taxonomy footprint (profile update)
    if (profile.address?.trim() || cityCount >= 1) filled.push('location');
    else missing.push('location');

    if (scopeCount >= 1) filled.push('scope');
    else missing.push('scope');

    if (hasContact) filled.push('contact');
    else missing.push('contact');

    return { filled, missing };
  },

  // --- Read/Update (E-37) ---

  /** Public read — only active profiles, no private/corporate fields. */
  async getPublicProfile(profileId: string): Promise<ProfilePublicResponse> {
    const profile = await profilesRepository.findById(profileId);
    if (!profile || profile.status !== 'active') throw AppError.notFound('Profile not found');

    const footprint = await profilesRepository.getFootprint(profileId);

    return {
      id: profile.id,
      displayName: profile.displayName,
      entityType: profile.entityType,
      bio: profile.bio,
      logoImageId: profile.logoImageId,
      status: profile.status,
      yearsExperience: profile.yearsExperience,
      projectCount: profile.projectCount,
      shareCount: profile.shareCount,
      avgRating: profile.avgRating,
      reviewCount: profile.reviewCount,
      footprint,
      createdAt: profile.createdAt.toISOString(),
    };
  },

  /** Public read by organization slug for shareable portfolio URLs. */
  async getPublicProfileBySlug(orgSlug: string): Promise<ProfilePublicResponse> {
    const profile = await profilesRepository.findByOrgSlug(orgSlug);
    if (!profile || profile.status !== 'active') throw AppError.notFound('Profile not found');

    const footprint = await profilesRepository.getFootprint(profile.id);

    return {
      id: profile.id,
      displayName: profile.displayName,
      entityType: profile.entityType,
      bio: profile.bio,
      logoImageId: profile.logoImageId,
      status: profile.status,
      yearsExperience: profile.yearsExperience,
      projectCount: profile.projectCount,
      shareCount: profile.shareCount,
      avgRating: profile.avgRating,
      reviewCount: profile.reviewCount,
      footprint,
      createdAt: profile.createdAt.toISOString(),
    };
  },

  /**
   * Owner update — requires write-capable org role.
   *
   * Access policy: uses isOrgWriter (owner/admin on the org membership) rather than
   * the platform requireOwnership guard. This is intentionally more restrictive —
   * superadmin does NOT have implicit write access to designer profiles. Superadmin
   * moderation should use a dedicated admin endpoint if needed (not this self-service path).
   *
   * Authz runs BEFORE the profile lookup to avoid leaking existence to non-writers.
   */
  async updateProfile(
    userId: string,
    activeOrgId: string | null,
    input: UpdateProfileInput,
  ): Promise<ProfileOwnerResponse> {
    if (!activeOrgId) {
      throw AppError.unprocessable('No active organization selected');
    }

    // Authz FIRST — don't leak profile existence to non-writers
    const canWrite = await isOrgWriter(userId, activeOrgId);
    if (!canWrite) {
      throw AppError.forbidden('Insufficient org role to update this profile');
    }

    const profile = await profilesRepository.findByOrgId(activeOrgId);
    if (!profile) {
      throw AppError.notFound('No profile found for the active organization');
    }

    // Validate taxonomy IDs (shared helper — single round-trip, consistent reporting)
    const { cityIds, scopeIds, themeIds, ...profileFields } = input;
    const taxonomyErrors = await profilesRepository.validateAllTaxonomyIds({
      cityIds,
      scopeIds,
      themeIds,
    });
    if (taxonomyErrors.length > 0) {
      throw AppError.unprocessable(taxonomyErrors.join('; '));
    }

    // Update profile fields
    const hasProfileUpdates = Object.keys(profileFields).length > 0;
    let updated = profile;
    if (hasProfileUpdates) {
      updated = await profilesRepository.updateProfile(profile.id, profileFields);
    }

    // Replace taxonomy footprints atomically (only for provided arrays)
    if (cityIds !== undefined) {
      await profilesRepository.replaceFootprintByKind(profile.id, 'city', cityIds);
    }
    if (scopeIds !== undefined) {
      await profilesRepository.replaceFootprintByKind(profile.id, 'scope', scopeIds);
    }
    if (themeIds !== undefined) {
      await profilesRepository.replaceFootprintByKind(profile.id, 'theme', themeIds);
    }

    // Return owner projection
    const footprint = await profilesRepository.getFootprint(profile.id);

    return {
      id: updated.id,
      orgId: updated.orgId,
      displayName: updated.displayName,
      entityType: updated.entityType,
      bio: updated.bio,
      logoImageId: updated.logoImageId,
      status: updated.status,
      yearsExperience: updated.yearsExperience,
      projectCount: updated.projectCount,
      shareCount: updated.shareCount,
      avgRating: updated.avgRating,
      reviewCount: updated.reviewCount,
      websiteUrl: updated.websiteUrl,
      googleBusinessUrl: updated.googleBusinessUrl,
      phone: updated.phone,
      address: updated.address,
      instagramHandle: updated.instagramHandle,
      linkedinHandle: updated.linkedinHandle,
      youtubeHandle: updated.youtubeHandle,
      firmType: updated.firmType,
      foundedYear: updated.foundedYear,
      staffCount: updated.staffCount,
      testimonialBannerEnabled: updated.testimonialBannerEnabled,
      footprint,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  },
};
