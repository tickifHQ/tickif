import { z } from 'zod';

/** A single onboarding checklist step. */
export const completionStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  done: z.boolean(),
});
export type CompletionStep = z.infer<typeof completionStepSchema>;

/** Response shape for GET /api/profiles/me/completion */
export const profileCompletionResponseSchema = z
  .object({
    steps: z.array(completionStepSchema),
    score: z.number().int().min(0).max(100),
    missing: z.array(z.string()),
  })
  .meta({ id: 'ProfileCompletion' });
export type ProfileCompletionResponse = z.infer<typeof profileCompletionResponseSchema>;

// --- Onboarding (E-35) ---

/**
 * POST /api/profiles/me — designer onboarding request.
 *
 * Note: locality validation is deferred because taxonomy_kind currently has no
 * 'locality' kind. When added (under taxonomy epic #6), localityIds can be
 * appended to this contract without breaking changes.
 */
export const onboardDesignerSchema = z
  .object({
    entityType: z.enum(['individual', 'company']),
    userName: z.string().trim().min(2).max(100),
    companyName: z.string().trim().min(2).max(100).optional(),
    bio: z.string().max(500).optional(),
    cityIds: z.array(z.string().uuid()).max(5).default([]),
    scopeIds: z.array(z.string().uuid()).max(10).default([]),
    themeIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine((d) => d.entityType === 'individual' || !!d.companyName, {
    message: 'companyName is required for company entity type',
    path: ['companyName'],
  });
export type OnboardDesignerInput = z.infer<typeof onboardDesignerSchema>;

/** POST /api/profiles/me — onboarding response. */
export const onboardDesignerResponseSchema = z
  .object({
    profile: z.object({
      id: z.string().uuid(),
      orgId: z.string(),
      displayName: z.string(),
      entityType: z.enum(['individual', 'company']),
      status: z.string(),
      createdAt: z.string(),
    }),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
  })
  .meta({ id: 'OnboardDesignerResponse' });
export type OnboardDesignerResponse = z.infer<typeof onboardDesignerResponseSchema>;

// --- Profile Read/Update (E-37) ---

/** Footprint entry in profile responses. */
const footprintEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  slug: z.string(),
  label: z.string(),
});

/**
 * Base profile fields — single source of truth for both projections.
 * Public and owner projections are derived via .omit/.extend to prevent drift.
 */
const profileBaseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  displayName: z.string(),
  entityType: z.enum(['individual', 'company']),
  bio: z.string().nullable(),
  logoImageId: z.string().nullable(),
  status: z.string(),
  yearsExperience: z.number(),
  projectCount: z.number(),
  shareCount: z.number(),
  avgRating: z.string(),
  reviewCount: z.number(),
  websiteUrl: z.string().nullable(),
  staffCount: z.number().nullable(),
  testimonialBannerEnabled: z.boolean(),
  footprint: z.array(footprintEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Public profile projection — excludes private/corporate fields. */
export const profilePublicResponseSchema = profileBaseSchema
  .omit({
    orgId: true,
    updatedAt: true,
    websiteUrl: true,
    staffCount: true,
    testimonialBannerEnabled: true,
  })
  .meta({ id: 'ProfilePublic' });
export type ProfilePublicResponse = z.infer<typeof profilePublicResponseSchema>;

/** Owner profile projection — full fields including corporate. */
export const profileOwnerResponseSchema = profileBaseSchema.meta({ id: 'ProfileOwner' });
export type ProfileOwnerResponse = z.infer<typeof profileOwnerResponseSchema>;

/** Profile ID path parameter. */
export const profileIdParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * PATCH /api/profiles/me — partial update.
 * Taxonomy arrays use replace semantics: present → replace, absent → untouched.
 */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().max(500).optional().nullable(),
  logoImageId: z.string().optional().nullable(),
  entityType: z.enum(['individual', 'company']).optional(),
  websiteUrl: z.string().url().max(200).optional().nullable(),
  staffCount: z.number().int().min(0).optional().nullable(),
  testimonialBannerEnabled: z.boolean().optional(),
  cityIds: z.array(z.string().uuid()).max(5).optional(),
  scopeIds: z.array(z.string().uuid()).max(10).optional(),
  themeIds: z.array(z.string().uuid()).max(10).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
