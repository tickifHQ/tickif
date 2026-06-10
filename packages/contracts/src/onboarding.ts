import { z } from 'zod';

/**
 * Contracts for designer/company onboarding.
 *
 * POST /api/profiles/me — one-time profile creation that upgrades an
 * authenticated user to a designer and optionally provisions an organization.
 */

export const entityType = z.enum(['individual', 'company']);
export type EntityType = z.infer<typeof entityType>;

export const onboardProfileSchema = z
  .object({
    entityType: entityType,
    studioName: z.string().min(2).max(160),
    bio: z.string().max(2000).optional(),
    citySlug: z.string().min(1).max(80),
    scopeSlugs: z.array(z.string().min(1).max(80)).optional(),
    themeSlugs: z.array(z.string().min(1).max(80)).optional(),
  })
  .meta({ id: 'OnboardProfile' });
export type OnboardProfileInput = z.infer<typeof onboardProfileSchema>;

export const onboardProfileResponseSchema = z
  .object({
    profile: z.object({
      id: z.string(),
      entityType: entityType,
      studioName: z.string(),
      bio: z.string().nullable(),
      citySlug: z.string().nullable(),
      isVerified: z.boolean(),
      createdAt: z.string().datetime(),
    }),
    organization: z
      .object({
        id: z.string(),
        name: z.string(),
        slug: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'OnboardProfileResponse' });
export type OnboardProfileResponse = z.infer<typeof onboardProfileResponseSchema>;
