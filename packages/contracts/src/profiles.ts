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

/** Authenticated current profile context used by designer workspace screens. */
export const currentProfileResponseSchema = profileOwnerResponseSchema
  .extend({
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
    shareUrl: z.string().url(),
  })
  .meta({ id: 'CurrentProfile' });
export type CurrentProfileResponse = z.infer<typeof currentProfileResponseSchema>;

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

// Shared profile field schemas (single source of truth for both endpoints)
const sharedProfileFields = {
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().max(500).nullable().optional(),
  websiteUrl: z.string().url().max(200).nullable().optional(),
  instagramHandle: z.string().trim().max(60).nullable().optional(),
  linkedinHandle: z.string().trim().max(60).nullable().optional(),
  youtubeHandle: z.string().trim().max(60).nullable().optional(),
};

/**
 * PATCH /api/profiles/me — partial update.
 * Taxonomy arrays use replace semantics: present → replace, absent → untouched.
 */
export const updateProfileSchema = z.object({
  ...sharedProfileFields,
  entityType: z.enum(['individual', 'company']).optional(),
  googleBusinessUrl: z.string().url().max(200).optional().nullable(),
  phone: z.string().trim().min(7).max(20).optional().nullable(),
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


// --- Portfolio (E-222) ---

const portfolioSlugSchema = z.string().trim().min(3).max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only');

export const portfolioBadgeSchema = z
  .enum(['verified', 'new', 'top-performer', 'established', 'projects-published'])
  .meta({ id: 'PortfolioBadge' });
export type PortfolioBadge = z.infer<typeof portfolioBadgeSchema>;

export const portfolioResponseSchema = z
  .object({
    id: z.string().uuid(),
    publicLinkEnabled: z.boolean(),
    portfolioSlug: z.string().nullable(),
    accentColor: z.string(),
    showHero: z.boolean(),
    showTrustCredentials: z.boolean(),
    showFeaturedTestimonial: z.boolean(),
    showReviews: z.boolean(),
    showSocialLinks: z.boolean(),
    showShareBlock: z.boolean(),
    tagline: z.string().nullable(),
    displayName: z.string(),
    bio: z.string().nullable(),
    logoUrl: z.string().url().nullable(),
    websiteUrl: z.string().nullable(),
    instagramHandle: z.string().nullable(),
    linkedinHandle: z.string().nullable(),
    youtubeHandle: z.string().nullable(),
    testimonialWords: z.string().nullable(),
    testimonialAuthor: z.string().nullable(),
    testimonialProjectId: z.string().uuid().nullable(),
    showOverallRating: z.boolean(),
    showPositiveReviewsOnly: z.boolean(),
    showTickifBadge: z.boolean(),
    badges: z.array(portfolioBadgeSchema),
    portfolioUrl: z.string().nullable(),
    publishedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'PortfolioResponse' });
export type PortfolioResponse = z.infer<typeof portfolioResponseSchema>;

export const updatePortfolioSchema = z
  .object({
    publicLinkEnabled: z.boolean().optional(),
    portfolioSlug: portfolioSlugSchema.nullable().optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color').optional(),
    showHero: z.boolean().optional(),
    showTrustCredentials: z.boolean().optional(),
    showFeaturedTestimonial: z.boolean().optional(),
    showReviews: z.boolean().optional(),
    showSocialLinks: z.boolean().optional(),
    showShareBlock: z.boolean().optional(),
    tagline: z.string().max(200).nullable().optional(),
    ...sharedProfileFields,
    testimonialWords: z.string().max(500).nullable().optional(),
    testimonialAuthor: z.string().max(100).nullable().optional(),
    testimonialProjectId: z.string().uuid().nullable().optional(),
    showOverallRating: z.boolean().optional(),
    showPositiveReviewsOnly: z.boolean().optional(),
    showTickifBadge: z.boolean().optional(),
  })
  .meta({ id: 'UpdatePortfolio' });
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;

export const slugAvailabilitySchema = z
  .object({
    slug: portfolioSlugSchema,
  })
  .meta({ id: 'SlugAvailabilityRequest' });

export const slugAvailabilityResponseSchema = z
  .object({
    slug: z.string(),
    available: z.boolean(),
  })
  .meta({ id: 'SlugAvailabilityResponse' });
export type SlugAvailabilityResponse = z.infer<typeof slugAvailabilityResponseSchema>;

// --- Logo Upload (E-222) ---

/** POST /api/profiles/me/portfolio/logo/upload — request body. */
export const logoUploadRequestSchema = z
  .object({
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    contentLength: z.number().int().min(1).max(5_000_000),
  })
  .meta({ id: 'LogoUploadRequest' });
export type LogoUploadRequest = z.infer<typeof logoUploadRequestSchema>;

/** POST /api/profiles/me/portfolio/logo/upload — response with presigned URL. */
export const logoUploadUrlResponseSchema = z
  .object({
    uploadUrl: z.string().url(),
    key: z.string(),
  })
  .meta({ id: 'LogoUploadUrlResponse' });
export type LogoUploadUrlResponse = z.infer<typeof logoUploadUrlResponseSchema>;

/** POST /api/profiles/me/portfolio/logo/commit — response with public logo URL. */
export const uploadLogoResponseSchema = z
  .object({
    logoUrl: z.string().url(),
  })
  .meta({ id: 'UploadLogoResponse' });
export type UploadLogoResponse = z.infer<typeof uploadLogoResponseSchema>;

/** POST /api/profiles/me/portfolio/logo/commit — request body. */
export const logoCommitRequestSchema = z
  .object({
    // Keys are minted by the presign endpoint as `originals/logos/<profileId>/<uuid>`;
    // reject anything outside that shape before it reaches the service.
    objectKey: z
      .string()
      .max(512)
      .regex(
        /^originals\/logos\/[^/]+\/[^/]+$/,
        'Must be an originals/logos/ object key',
      ),
  })
  .meta({ id: 'LogoCommitRequest' });
export type LogoCommitRequest = z.infer<typeof logoCommitRequestSchema>;
