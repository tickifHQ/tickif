import type {
  GoogleReview,
  PublicPortfolioResponse,
  PublicPortfolioReview,
  PublicPortfolioSections,
  PublicPortfolioTestimonial,
} from '@repo/contracts';
import { AppError } from '../../lib/errors.js';
import {
  portfolioRepository,
  type PortfolioRecord,
  type PublicPortfolioRecord,
} from './portfolio-repository.js';
import {
  computeBadges,
  presignProfileLogo,
  publicPortfolioSlug,
  publicPortfolioUrl,
} from './portfolio-service.js';
import { googleReviewsRepository } from './google-repository.js';
import { readState } from './google-mapper.js';
import { projectsService } from '../projects/service.js';
import { reviewsService } from '../reviews/service.js';

/**
 * Read model for the public designer portfolio page (`/d/{slug}`).
 *
 * Assembles one payload from the profile, the portfolio presentation settings,
 * the Google review cache, and the designer's published projects — so the page
 * renders in a single server round-trip under one cache policy and one
 * `publicLinkEnabled` gate.
 *
 * Everything here is anonymous-readable by definition, so the projection is
 * allow-listed field by field rather than derived from the owner response:
 * `phone`, `address`, `googleBusinessUrl`, and the raw logo storage key never
 * cross this boundary.
 */

/** Projects included in the initial payload. The gallery pages for the rest. */
const INITIAL_PROJECT_LIMIT = 30;

/** Minimum star rating a review needs when `showPositiveReviewsOnly` is on. */
const POSITIVE_REVIEW_MIN_RATING = 4;

/**
 * Section defaults for designers who have never opened the portfolio settings
 * page and so have no `designer_portfolio` row. Mirrors the column defaults in
 * `packages/db/src/schema/domain.ts` — a designer who never touched the
 * settings still gets a complete page rather than a 404.
 */
const DEFAULT_SECTIONS: PublicPortfolioSections = {
  hero: true,
  trustCredentials: true,
  featuredTestimonial: true,
  reviews: true,
  socialLinks: true,
  shareBlock: true,
  overallRating: true,
  tickifBadge: true,
};

const DEFAULT_ACCENT_COLOR = '#FF8F73';

function sectionsOf(portfolio: PortfolioRecord | null): PublicPortfolioSections {
  if (!portfolio) return DEFAULT_SECTIONS;
  return {
    hero: portfolio.showHero,
    trustCredentials: portfolio.showTrustCredentials,
    featuredTestimonial: portfolio.showFeaturedTestimonial,
    reviews: portfolio.showTickifReviews || portfolio.showGoogleReviews,
    socialLinks: portfolio.showSocialLinks,
    shareBlock: portfolio.showShareBlock,
    overallRating:
      portfolio.showTickifOverallRating || portfolio.showGoogleOverallRating,
    tickifBadge: portfolio.showTickifBadge,
  };
}

/**
 * Map a cached Google review onto the page projection.
 *
 * `time` (unix seconds) plus the author name is stable per review within a
 * cached payload, which is all the web needs for a React key.
 */
function toPublicReview(review: GoogleReview, index: number): PublicPortfolioReview {
  return {
    id: `google-${review.time}-${index}`,
    author: review.author,
    avatarUrl: review.profilePhotoUrl,
    rating: review.rating,
    relativeTime: review.relativeTime,
    text: review.text,
    verifiedConsultation: false,
    source: 'google',
  };
}

function relativeReviewTime(value: string): string {
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (elapsedDays === 0) return 'today';
  if (elapsedDays < 30) return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 12) {
    return `${elapsedMonths} month${elapsedMonths === 1 ? '' : 's'} ago`;
  }
  const elapsedYears = Math.floor(elapsedMonths / 12);
  return `${elapsedYears} year${elapsedYears === 1 ? '' : 's'} ago`;
}

export const publicPortfolioService = {
  /**
   * GET /api/portfolios/{slug} — the public portfolio page payload.
   *
   * 404s (never 403) for a suspended/draft profile or a portfolio whose public
   * link is switched off, so an unpublished portfolio is indistinguishable from
   * one that never existed.
   */
  async getBySlug(slug: string): Promise<PublicPortfolioResponse> {
    const resolved = await portfolioRepository.findPublicBySlug(slug);
    if (!resolved) throw AppError.notFound('Portfolio not found');

    const { profile, orgSlug, portfolio } = resolved;
    if (profile.status !== 'active') throw AppError.notFound('Portfolio not found');
    // Absent row means "never configured", which keeps the column default (enabled).
    if (portfolio && !portfolio.publicLinkEnabled) throw AppError.notFound('Portfolio not found');

    const sections = sectionsOf(portfolio);

    const [
      logoUrl,
      googleRow,
      tickif,
      cities,
      projects,
      startingBudget,
      testimonial,
    ] = await Promise.all([
      presignProfileLogo(profile),
      googleReviewsRepository.findByProfileId(profile.id),
      reviewsService.listPublished({
        designerProfileId: profile.id,
        page: 1,
        limit: 50,
      }),
      portfolioRepository.findCityLabels(profile.id),
      // The profile was already loaded and status-checked above.
      projectsService.designerProjects(
        profile.id,
        { page: 1, limit: INITIAL_PROJECT_LIMIT },
        { skipDesignerCheck: true },
      ),
      projectsService.designerStartingBudget(profile.id),
      resolveTestimonial(profile.id, portfolio, sections),
    ]);

    // `readState` applies the Places ToS read-time guard: content older than the
    // 30-day window is withheld and the row reads `stale`, so nothing expired
    // can leak onto a public page even if the worker sweep lagged.
    const google = googleRow ? readState(googleRow) : null;
    const tickifSettings = {
      showReviews: portfolio?.showTickifReviews ?? true,
      showOverallRating: portfolio?.showTickifOverallRating ?? true,
      showPositiveReviewsOnly: portfolio?.showTickifPositiveReviewsOnly ?? false,
    };
    const googleSettings = {
      showReviews: portfolio?.showGoogleReviews ?? true,
      showOverallRating: portfolio?.showGoogleOverallRating ?? true,
      showPositiveReviewsOnly: portfolio?.showGooglePositiveReviewsOnly ?? false,
    };
    const tickifReviews = tickifSettings.showReviews
      ? tickif.items.filter(
          (review) =>
            !tickifSettings.showPositiveReviewsOnly ||
            review.rating >= POSITIVE_REVIEW_MIN_RATING,
        )
      : [];
    const googleReviews = googleSettings.showReviews
      ? (google?.reviews ?? []).filter(
          (review) =>
            !googleSettings.showPositiveReviewsOnly ||
            review.rating >= POSITIVE_REVIEW_MIN_RATING,
        )
      : [];
    const googleRating = google?.summary.rating ?? null;

    return {
      profileId: profile.id,
      slug,
      canonicalUrl: publicPortfolioUrl(portfolio?.portfolioSlug ?? null, orgSlug),
      displayName: profile.displayName,
      entityType: profile.entityType,
      tagline: portfolio?.tagline ?? null,
      bio: profile.bio,
      firmType: profile.firmType,
      foundedYear: profile.foundedYear,
      cities,
      logoUrl,
      accentColor: portfolio?.accentColor ?? DEFAULT_ACCENT_COLOR,
      badges: sections.trustCredentials ? computeBadges(profile) : [],
      sections,
      stats: {
        tickif: tickifSettings.showOverallRating
          ? {
              rating: Number(profile.avgRating) || 0,
              reviewCount: profile.reviewCount,
            }
          : null,
        google:
          googleSettings.showOverallRating && googleRating !== null
            ? {
                rating: googleRating,
                reviewCount: google?.summary.userRatingsTotal ?? 0,
              }
            : null,
        projectCount: profile.projectCount,
        yearsExperience: profile.yearsExperience,
        startingBudget,
      },
      social: sections.socialLinks
        ? {
            websiteUrl: profile.websiteUrl,
            instagramHandle: profile.instagramHandle,
            linkedinHandle: profile.linkedinHandle,
            youtubeHandle: profile.youtubeHandle,
          }
        : { websiteUrl: null, instagramHandle: null, linkedinHandle: null, youtubeHandle: null },
      testimonial,
      reviewVisibility: {
        tickif: {
          reviews: tickifSettings.showReviews,
          overallRating: tickifSettings.showOverallRating,
        },
        google: {
          reviews: googleSettings.showReviews,
          overallRating: googleSettings.showOverallRating,
        },
      },
      reviews: [
        ...tickifReviews.map((review) => ({
          id: review.id,
          author: review.author.name,
          avatarUrl: review.author.avatarUrl,
          rating: review.rating,
          relativeTime: relativeReviewTime(review.publishedAt ?? review.createdAt),
          text: review.body,
          verifiedConsultation: review.verifiedConsultation,
          source: 'tickif' as const,
        })),
        ...googleReviews.map(toPublicReview),
      ],
      projects,
      publishedAt: portfolio?.publishedAt?.toISOString() ?? null,
    };
  },

  /** The canonical slug for a resolved portfolio — used for redirects. */
  canonicalSlugOf(resolved: PublicPortfolioRecord): string {
    return publicPortfolioSlug(resolved.portfolio?.portfolioSlug ?? null, resolved.orgSlug);
  },
};

/**
 * The designer-curated pull quote, or null when disabled, unset, or the linked
 * project is no longer published (a quote citing an unpublished project would
 * reference work a visitor cannot open).
 */
async function resolveTestimonial(
  profileId: string,
  portfolio: PortfolioRecord | null,
  sections: PublicPortfolioSections,
): Promise<PublicPortfolioTestimonial | null> {
  if (!sections.featuredTestimonial) return null;
  if (!portfolio?.testimonialWords) return null;

  const projectTitle = portfolio.testimonialProjectId
    ? await portfolioRepository.findPublishedProjectTitle(portfolio.testimonialProjectId, profileId)
    : null;

  return {
    words: portfolio.testimonialWords,
    author: portfolio.testimonialAuthor,
    projectTitle,
  };
}
