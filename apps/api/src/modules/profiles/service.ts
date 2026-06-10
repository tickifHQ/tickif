import type { OnboardProfileInput, OnboardProfileResponse } from '@repo/contracts';
import { auth } from '@repo/auth';
import { AppError } from '../../lib/errors.js';
import { profilesRepository, type ProfileRecord } from './repository.js';

/**
 * Profile onboarding use-cases. Business logic lives here — no Hono, no Drizzle.
 *
 * // TODO(#5): full org-member permissions deferred.
 */

function toProfileResponse(row: ProfileRecord) {
  return {
    id: row.id,
    entityType: row.entityType,
    studioName: row.studioName,
    bio: row.bio,
    citySlug: row.citySlug,
    isVerified: row.isVerified,
    createdAt: row.createdAt.toISOString(),
  };
}

export const profilesService = {
  /**
   * Onboard a user as a designer. Idempotent — returns existing if already onboarded.
   */
  async onboard(userId: string, input: OnboardProfileInput): Promise<OnboardProfileResponse> {
    // Idempotency: if already a designer, return existing profile.
    const existing = await profilesRepository.findByUserId(userId);
    if (existing) {
      return { profile: toProfileResponse(existing), organization: null };
    }

    // Taxonomy validation — must happen before any writes.
    // // TODO(#6): replace with Taxonomy module API when available.
    const cityExists = await profilesRepository.taxonomySlugExists('city', input.citySlug);
    if (!cityExists) {
      throw AppError.badRequest(`Invalid citySlug: "${input.citySlug}" does not exist`, {
        field: 'citySlug',
      });
    }

    if (input.scopeSlugs?.length) {
      const invalidScopes = await profilesRepository.findInvalidTaxonomySlugs(
        'scope',
        input.scopeSlugs,
      );
      if (invalidScopes.length > 0) {
        throw AppError.badRequest(`Invalid scopeSlugs: ${invalidScopes.join(', ')}`, {
          field: 'scopeSlugs',
          invalid: invalidScopes,
        });
      }
    }

    if (input.themeSlugs?.length) {
      const invalidThemes = await profilesRepository.findInvalidTaxonomySlugs(
        'theme',
        input.themeSlugs,
      );
      if (invalidThemes.length > 0) {
        throw AppError.badRequest(`Invalid themeSlugs: ${invalidThemes.join(', ')}`, {
          field: 'themeSlugs',
          invalid: invalidThemes,
        });
      }
    }

    // Create profile + upgrade role (transactional).
    const profile = await profilesRepository.createWithRoleUpgrade({
      userId,
      entityType: input.entityType,
      studioName: input.studioName,
      bio: input.bio,
      citySlug: input.citySlug,
    });

    // Company path: provision a better-auth organization with the user as owner.
    let organization: OnboardProfileResponse['organization'] = null;
    if (input.entityType === 'company') {
      // // TODO(#5): full org-member permissions deferred.
      const slug = input.studioName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

      const org = await auth.api.createOrganization({
        body: {
          name: input.studioName,
          slug,
          userId,
        },
      });

      if (org) {
        organization = { id: org.id, name: org.name, slug: org.slug };
      }
    }

    return { profile: toProfileResponse(profile), organization };
  },
};
