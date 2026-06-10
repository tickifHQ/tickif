import { z } from 'zod';

/**
 * Shared contracts for the `profiles` slice.
 *
 * Two projections:
 * - PublicProfileSchema: safe for any viewer (no contact info).
 * - OwnerProfileSchema: returned only to the profile owner (adds email + phone).
 */

export const publicProfileSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    bio: z.string().nullable(),
    studioName: z.string(),
    citySlug: z.string().nullable(),
    isVerified: z.boolean(),
    role: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'PublicProfile' });
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const ownerProfileSchema = publicProfileSchema
  .extend({
    email: z.string(),
    phone: z.string().nullable(),
  })
  .meta({ id: 'OwnerProfile' });
export type OwnerProfile = z.infer<typeof ownerProfileSchema>;

export const patchProfileSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    bio: z.string().max(2000).optional(),
    avatarUrl: z.string().url().optional(),
    studioName: z.string().min(1).max(160).optional(),
    citySlug: z.string().min(1).max(80).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field must be provided',
  })
  .meta({ id: 'PatchProfile' });
export type PatchProfileInput = z.infer<typeof patchProfileSchema>;

export const profileIdParamSchema = z.object({
  id: z.string(),
});
