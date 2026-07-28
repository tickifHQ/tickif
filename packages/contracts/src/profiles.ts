import { z } from 'zod';
import { designerProjectsResponseSchema } from './projects';

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

// --- Google reviews (portfolio Google Business integration) ---

/** Connection lifecycle mirrors the `google_place_status` DB enum. */
export const googlePlaceStatusSchema = z.enum(['pending', 'connected', 'error', 'stale']);
export type GooglePlaceStatus = z.infer<typeof googlePlaceStatusSchema>;

/**
 * Lightweight connection snapshot embedded in the portfolio response so the
 * settings page renders real state (badge + rating) without a second call.
 * Carries no review text — that comes from the dedicated reviews endpoint.
 */
export const googleConnectionSummarySchema = z
  .object({
    status: googlePlaceStatusSchema,
    placeId: z.string().nullable(),
    rating: z.number().min(0).max(5).nullable(),
    userRatingsTotal: z.number().int().nullable(),
    lastFetchedAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'GoogleConnectionSummary' });
export type GoogleConnectionSummary = z.infer<typeof googleConnectionSummarySchema>;

/**
 * Hero fields a designer must fill before the public page goes live.
 *
 * The public `/d/{slug}` page leads with the logo, studio name, tagline and bio;
 * without them the hero renders as an empty frame. Completing all four flips
 * `designer_profile.status` from `draft` to `active`, which is what every public
 * surface gates on (portfolio page, discovery feed, search index, bookings).
 */
export const requiredPortfolioFieldSchema = z.enum([
  'logo',
  'displayName',
  'tagline',
  'bio',
]);
export type RequiredPortfolioField = z.infer<typeof requiredPortfolioFieldSchema>;

export const portfolioReviewSourceSettingsSchema = z
  .object({
    showReviews: z.boolean(),
    showOverallRating: z.boolean(),
    showPositiveReviewsOnly: z.boolean(),
  })
  .meta({ id: 'PortfolioReviewSourceSettings' });
export type PortfolioReviewSourceSettings = z.infer<
  typeof portfolioReviewSourceSettingsSchema
>;

export const portfolioReviewSettingsSchema = z
  .object({
    tickif: portfolioReviewSourceSettingsSchema,
    google: portfolioReviewSourceSettingsSchema,
  })
  .meta({ id: 'PortfolioReviewSettings' });
export type PortfolioReviewSettings = z.infer<typeof portfolioReviewSettingsSchema>;

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
    reviewSettings: portfolioReviewSettingsSchema,
    showTickifBadge: z.boolean(),
    badges: z.array(portfolioBadgeSchema),
    portfolioUrl: z.string().nullable(),
    /**
     * Whether the public page is live. False while required hero fields are
     * blank — distinct from `publicLinkEnabled`, which is the designer's own
     * switch for taking a *complete* portfolio offline.
     */
    publiclyVisible: z.boolean(),
    /** Required hero fields still blank. Empty once the portfolio is live. */
    missingRequiredFields: z.array(requiredPortfolioFieldSchema),
    // Null when the designer has never connected a Google Business location.
    googleConnection: googleConnectionSummarySchema.nullable(),
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
    reviewSettings: z
      .object({
        tickif: portfolioReviewSourceSettingsSchema.partial().optional(),
        google: portfolioReviewSourceSettingsSchema.partial().optional(),
      })
      .optional(),
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

// --- Google reviews endpoints ---

/** A single Google review, as surfaced on the portfolio. */
export const googleReviewSchema = z
  .object({
    author: z.string(),
    authorUrl: z.string().url().nullable(),
    profilePhotoUrl: z.string().url().nullable(),
    rating: z.number().min(0).max(5),
    relativeTime: z.string(),
    text: z.string(),
    /** Unix seconds when the review was written. */
    time: z.number().int(),
  })
  .meta({ id: 'GoogleReview' });
export type GoogleReview = z.infer<typeof googleReviewSchema>;

/**
 * GET /api/profiles/me/portfolio/google — owner view of the connection + cached
 * reviews. Reviews are omitted (empty) when the payload has been purged for
 * ToS staleness; `summary.status` then reads `stale`.
 */
export const googleReviewsResponseSchema = z
  .object({
    /** False when the platform has no Places API key — UI shows "unavailable". */
    available: z.boolean(),
    /** Null when the designer has never connected a Google Business location. */
    connection: googleConnectionSummarySchema.nullable(),
    reviews: z.array(googleReviewSchema),
  })
  .meta({ id: 'GoogleReviewsResponse' });
export type GoogleReviewsResponse = z.infer<typeof googleReviewsResponseSchema>;

/**
 * POST /api/profiles/me/portfolio/google/connect — link a Google Business
 * location. Accepts a Google Maps URL, a raw place-id, or free-text the Places
 * API can resolve (e.g. "Studio Aakar, Bengaluru").
 */
export const connectGooglePlaceSchema = z
  .object({
    reference: z.string().trim().min(1).max(500),
  })
  .meta({ id: 'ConnectGooglePlace' });
export type ConnectGooglePlaceInput = z.infer<typeof connectGooglePlaceSchema>;

// --- Public portfolio page (E-203) ---

/**
 * Path parameter for `GET /api/portfolios/{slug}`.
 *
 * Accepts either the designer-chosen `portfolioSlug` or the owning organization
 * slug, so links minted before the designer picked a custom slug keep resolving.
 * Shares `profileSlugParamSchema`'s URL-safe shape.
 */
export const portfolioSlugParamSchema = profileSlugParamSchema.meta({
  id: 'PortfolioSlugParam',
});

/** Provider backing a public review or rating aggregate. */
export const publicReviewSourceSchema = z.enum(['tickif', 'google']);
export type PublicReviewSource = z.infer<typeof publicReviewSourceSchema>;

/**
 * A review as rendered on the public portfolio — provider-agnostic so a second
 * source can be added without changing the page.
 */
export const publicPortfolioReviewSchema = z
  .object({
    /** Stable within a response; composed from the provider payload for React keys. */
    id: z.string(),
    author: z.string(),
    avatarUrl: z.string().url().nullable(),
    rating: z.number().min(0).max(5),
    relativeTime: z.string(),
    text: z.string(),
    source: publicReviewSourceSchema,
  })
  .meta({ id: 'PublicPortfolioReview' });
export type PublicPortfolioReview = z.infer<typeof publicPortfolioReviewSchema>;

/**
 * Which sections the designer has enabled. Mirrors the `show*` portfolio
 * settings so the public page never has to know the settings field names.
 */
export const publicPortfolioSectionsSchema = z
  .object({
    hero: z.boolean(),
    trustCredentials: z.boolean(),
    featuredTestimonial: z.boolean(),
    reviews: z.boolean(),
    socialLinks: z.boolean(),
    shareBlock: z.boolean(),
    overallRating: z.boolean(),
    tickifBadge: z.boolean(),
  })
  .meta({ id: 'PublicPortfolioSections' });
export type PublicPortfolioSections = z.infer<typeof publicPortfolioSectionsSchema>;

/** Headline proof numbers shown in the hero and studio strips. */
export const publicPortfolioStatsSchema = z
  .object({
    /** Null when the source aggregate is hidden or unavailable. */
    tickif: z
      .object({
        rating: z.number().min(0).max(5),
        reviewCount: z.number().int().nonnegative(),
      })
      .nullable(),
    /** Null when hidden, disconnected, or outside Google's cache window. */
    google: z
      .object({
        rating: z.number().min(0).max(5),
        reviewCount: z.number().int().nonnegative(),
      })
      .nullable(),
    projectCount: z.number().int(),
    yearsExperience: z.number().int(),
    /**
     * Label of the lowest budget band across published projects (taxonomy
     * `sortOrder`), or null when no published project carries a band.
     */
    startingBudget: z.string().nullable(),
  })
  .meta({ id: 'PublicPortfolioStats' });
export type PublicPortfolioStats = z.infer<typeof publicPortfolioStatsSchema>;

export const publicPortfolioReviewVisibilitySchema = z
  .object({
    tickif: z.object({
      reviews: z.boolean(),
      overallRating: z.boolean(),
    }),
    google: z.object({
      reviews: z.boolean(),
      overallRating: z.boolean(),
    }),
  })
  .meta({ id: 'PublicPortfolioReviewVisibility' });
export type PublicPortfolioReviewVisibility = z.infer<
  typeof publicPortfolioReviewVisibilitySchema
>;

/** The designer's public links, already filtered by `sections.socialLinks`. */
export const publicPortfolioSocialSchema = z
  .object({
    websiteUrl: z.string().nullable(),
    instagramHandle: z.string().nullable(),
    linkedinHandle: z.string().nullable(),
    youtubeHandle: z.string().nullable(),
  })
  .meta({ id: 'PublicPortfolioSocial' });
export type PublicPortfolioSocial = z.infer<typeof publicPortfolioSocialSchema>;

/** The designer-curated pull quote, when set and enabled. */
export const publicPortfolioTestimonialSchema = z
  .object({
    words: z.string(),
    author: z.string().nullable(),
    /** Title of the linked published project, when the designer picked one. */
    projectTitle: z.string().nullable(),
  })
  .meta({ id: 'PublicPortfolioTestimonial' });
export type PublicPortfolioTestimonial = z.infer<typeof publicPortfolioTestimonialSchema>;

/**
 * GET /api/portfolios/{slug} — everything the public designer page renders, in
 * one request.
 *
 * Composite by design: the page is a single server-rendered screen, so one
 * round-trip keeps it fast and lets the whole payload share one cache policy and
 * one `publicLinkEnabled` gate. The embedded first page of projects is enough
 * for the initial grid; `GET /api/profiles/{profileId}/projects` serves the rest.
 */
export const publicPortfolioResponseSchema = z
  .object({
    profileId: z.string().uuid(),
    /** The slug that resolved this portfolio (may be the org slug). */
    slug: z.string(),
    /** Canonical `/d/{slug}` URL — prefers the designer's chosen portfolio slug. */
    canonicalUrl: z.string().url(),
    displayName: z.string(),
    entityType: z.enum(['individual', 'company']),
    tagline: z.string().nullable(),
    bio: z.string().nullable(),
    /** Free-text studio type, e.g. "Interior Design Studio". */
    firmType: z.string().nullable(),
    foundedYear: z.number().int().nullable(),
    /** City footprint labels. The street address stays private. */
    cities: z.array(z.string()),
    logoUrl: z.string().url().nullable(),
    accentColor: z.string(),
    badges: z.array(portfolioBadgeSchema),
    sections: publicPortfolioSectionsSchema,
    stats: publicPortfolioStatsSchema,
    reviewVisibility: publicPortfolioReviewVisibilitySchema,
    social: publicPortfolioSocialSchema,
    testimonial: publicPortfolioTestimonialSchema.nullable(),
    reviews: z.array(publicPortfolioReviewSchema),
    projects: designerProjectsResponseSchema,
    publishedAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'PublicPortfolio' });
export type PublicPortfolioResponse = z.infer<typeof publicPortfolioResponseSchema>;
