import type { PublicProfile, OwnerProfile, PatchProfileInput } from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import { profilesRepository, type ProfileRecord } from './repository.js';

/**
 * Profile use-cases. Two projections:
 * - Public: safe for any viewer (no email/phone).
 * - Owner: returned only to the profile owner.
 *
 * // TODO(#10): entitlement-gated fields (companySize, featuredBadge) deferred.
 */

function toPublicProfile(row: ProfileRecord): PublicProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    studioName: row.studioName,
    citySlug: row.citySlug,
    isVerified: row.isVerified,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

function toOwnerProfile(row: ProfileRecord): OwnerProfile {
  return {
    ...toPublicProfile(row),
    email: row.email,
    phone: row.phone,
  };
}

export const profilesService = {
  /**
   * Public profile read — excludes private contact fields.
   */
  async getPublicProfile(id: string): Promise<PublicProfile> {
    const row = await profilesRepository.findById(id);
    if (!row) throw AppError.notFound(`Profile ${id} not found`);
    return toPublicProfile(row);
  },

  /**
   * Owner update — only the authenticated user can update their own profile.
   * // TODO(#5): org-member update path deferred.
   */
  async updateProfile(userId: string, input: PatchProfileInput): Promise<OwnerProfile> {
    const row = await profilesRepository.findByUserId(userId);
    if (!row) throw AppError.notFound('Profile not found for current user');

    await profilesRepository.updateByUserId(userId, {
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      studioName: input.studioName,
      citySlug: input.citySlug,
    });

    // Re-fetch to return the updated state.
    const updated = await profilesRepository.findByUserId(userId);
    if (!updated) throw AppError.notFound('Profile not found after update');
    return toOwnerProfile(updated);
  },
};
