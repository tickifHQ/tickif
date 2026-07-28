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
    reviews: portfolio.showReviews,
    socialLinks: portfolio.showSocialLinks,
    shareBlock: portfolio.showShareBlock,
    overallRating: portfolio.showOverallRating,
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
    source: 'google',
  };
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

    const [logoUrl, googleRow, cities, projects, startingBudget, testimonial] = await Promise.all([
      presignProfileLogo(profile),
      googleReviewsRepository.findByProfileId(profile.id),
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
    const googleReviews = sections.reviews ? google?.reviews ?? [] : [];
    const visibleReviews = portfolio?.showPositiveReviewsOnly
      ? googleReviews.filter((review) => review.rating >= POSITIVE_REVIEW_MIN_RATING)
      : googleReviews;

    // Google's aggregate is the live signal when connected; the profile counters
    // are the fallback until Tickif's own review module lands.
    const googleRating = google?.summary.rating ?? null;
    const rating = googleRating ?? (Number(profile.avgRating) || 0);
    const reviewCount = googleRating !== null
      ? google?.summary.userRatingsTotal ?? 0
      : profile.reviewCount;

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
        // Withheld, not merely hidden — `showOverallRating` behaves like every other
        // section gate above rather than relying on the client to not render it.
        // Zeroing `reviewCount` is what the page already keys off at every call site.
        rating: sections.overallRating ? rating : 0,
        reviewCount: sections.overallRating ? reviewCount : 0,
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
      reviews: visibleReviews.map(toPublicReview),
      reviewSource: visibleReviews.length > 0 ? 'google' : null,
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
