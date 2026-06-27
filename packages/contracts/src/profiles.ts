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

export const profileDashboardResponseSchema = z
  .object({
    profileCompletion: profileCompletionResponseSchema.pick({
      score: true,
      missing: true,
    }),
    projects: z.object({
      total: z.number().int(),
      published: z.number().int(),
      inReview: z.number().int(),
      draft: z.number().int(),
    }),
    leads: z.object({
      total: z.number().int(),
      new: z.number().int(),
    }),
    shareUrl: z.string().url(),
  })
  .meta({ id: 'ProfileDashboard' });
export type ProfileDashboardResponse = z.infer<typeof profileDashboardResponseSchema>;

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
    phone: z.string().trim().min(7).max(20).optional(),
    websiteUrl: z.string().url().max(200).optional(),
    googleBusinessUrl: z.string().url().max(200).optional(),
    instagramHandle: z.string().trim().max(60).optional(),
    linkedinHandle: z.string().trim().max(60).optional(),
    youtubeHandle: z.string().trim().max(60).optional(),
    firmType: z.string().trim().max(60).optional(),
    foundedYear: z.number().int().min(1900).max(2100).optional(),
    staffCount: z.number().int().min(0).optional(),
    // Free-text address replaces cityIds in onboarding — city taxonomy linking via profile update.
    // Note: clients still sending cityIds will have it silently stripped (Zod default behavior).
    // The web onboarding UI ships in lockstep with this contract change.
    address: z.string().trim().max(300).optional(),
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
  googleBusinessUrl: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  instagramHandle: z.string().nullable(),
  linkedinHandle: z.string().nullable(),
  youtubeHandle: z.string().nullable(),
  firmType: z.string().nullable(),
  foundedYear: z.number().nullable(),
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
    address: true,
    websiteUrl: true,
    googleBusinessUrl: true,
    phone: true,
    instagramHandle: true,
    linkedinHandle: true,
    youtubeHandle: true,
    firmType: true,
    foundedYear: true,
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

/** Public profile slug path parameter. */
export const profileSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a URL-safe profile slug'),
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
  googleBusinessUrl: z.string().url().max(200).optional().nullable(),
  phone: z.string().trim().min(7).max(20).optional().nullable(),
  instagramHandle: z.string().trim().max(60).optional().nullable(),
  linkedinHandle: z.string().trim().max(60).optional().nullable(),
  youtubeHandle: z.string().trim().max(60).optional().nullable(),
  firmType: z.string().trim().max(60).optional().nullable(),
  foundedYear: z.number().int().min(1900).max(2100).optional().nullable(),
  staffCount: z.number().int().min(0).optional().nullable(),
  testimonialBannerEnabled: z.boolean().optional(),
  address: z.string().trim().max(300).optional().nullable(),
  cityIds: z.array(z.string().uuid()).max(5).optional(),
  scopeIds: z.array(z.string().uuid()).max(10).optional(),
  themeIds: z.array(z.string().uuid()).max(10).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
