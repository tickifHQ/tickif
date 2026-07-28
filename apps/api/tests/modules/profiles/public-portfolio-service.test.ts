import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignerProjectsResponse, GoogleReview } from '@repo/contracts';
import type { PortfolioRecord } from '../../../src/modules/profiles/portfolio-repository.js';
import type { DesignerProfileRecord } from '../../../src/modules/profiles/repository.js';
import type { GooglePlaceCacheRecord } from '../../../src/modules/profiles/google-repository.js';

// --- Mocks ---

vi.mock('../../../src/modules/profiles/portfolio-repository.js', () => ({
  portfolioRepository: {
    findPublicBySlug: vi.fn(),
    findPublishedProjectTitle: vi.fn(async () => null),
    findCityLabels: vi.fn(async () => []),
    findOrgSlug: vi.fn(async () => 'test-studio-a1b2c3'),
  },
}));

vi.mock('../../../src/modules/profiles/google-repository.js', () => ({
  googleReviewsRepository: { findByProfileId: vi.fn(async () => null) },
}));

vi.mock('../../../src/modules/projects/service.js', () => ({
  projectsService: {
    designerProjects: vi.fn(),
    designerStartingBudget: vi.fn(async () => null),
  },
}));

vi.mock('@repo/storage', () => ({
  presignUpload: vi.fn(),
  presignDownload: vi.fn(async ({ key }: { key: string }) => `https://cdn.test/${key}`),
  objectExists: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('../../../src/modules/orgs/repository.js', () => ({ isOrgWriter: vi.fn() }));

// Import AFTER mock registration
const { publicPortfolioService } = await import(
  '../../../src/modules/profiles/public-portfolio-service.js'
);
const { portfolioRepository } = await import(
  '../../../src/modules/profiles/portfolio-repository.js'
);
const { googleReviewsRepository } = await import(
  '../../../src/modules/profiles/google-repository.js'
);
const { projectsService } = await import('../../../src/modules/projects/service.js');

// --- Factories ---

const makeProfile = (over: Partial<DesignerProfileRecord> = {}): DesignerProfileRecord => ({
  id: 'profile-1',
  orgId: 'org-1',
  userId: 'user-1',
  entityType: 'company',
  displayName: 'Test Studio',
  bio: 'We design beautiful spaces',
  logoImageId: 'originals/logos/profile-1/abc',
  status: 'active',
  yearsExperience: 6,
  projectCount: 12,
  shareCount: 3,
  avgRating: '4.20',
  reviewCount: 8,
  websiteUrl: 'https://test.studio',
  googleBusinessUrl: 'https://maps.google.com/?cid=1',
  phone: '+919000000000',
  address: '12 Private Lane, Chennai',
  instagramHandle: 'teststudio',
  linkedinHandle: null,
  youtubeHandle: null,
  firmType: 'Interior Design Studio',
  foundedYear: 2019,
  testimonialBannerEnabled: false,
  staffCount: 4,
  createdAt: new Date('2020-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

const makePortfolio = (over: Partial<PortfolioRecord> = {}): PortfolioRecord => ({
  id: 'portfolio-1',
  profileId: 'profile-1',
  publicLinkEnabled: true,
  portfolioSlug: 'test-studio',
  accentColor: '#FF8F73',
  showHero: true,
  showTrustCredentials: true,
  showFeaturedTestimonial: true,
  showReviews: true,
  showSocialLinks: true,
  showShareBlock: true,
  tagline: 'Quiet, light-filled homes',
  testimonialWords: null,
  testimonialAuthor: null,
  testimonialProjectId: null,
  testimonialUpdatedAt: null,
  showOverallRating: true,
  showPositiveReviewsOnly: false,
  showTickifBadge: true,
  publishedAt: new Date('2026-02-01'),
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

const makeGoogleReview = (over: Partial<GoogleReview> = {}): GoogleReview => ({
  author: 'Rahul S.',
  authorUrl: null,
  profilePhotoUrl: 'https://lh3.google.test/a/rahul',
  rating: 5,
  relativeTime: '2 weeks ago',
  text: 'Wonderful to work with.',
  time: 1_770_000_000,
  ...over,
});

const makeGoogleRow = (over: Partial<GooglePlaceCacheRecord> = {}): GooglePlaceCacheRecord =>
  ({
    profileId: 'profile-1',
    placeId: 'place-1',
    rating: '4.8',
    userRatingsTotal: 57,
    reviews: [makeGoogleReview()],
    status: 'connected',
    // Inside the 30-day ToS window relative to the faked clock below.
    lastFetchedAt: new Date('2026-07-20T00:00:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-07-20'),
    ...over,
  }) as GooglePlaceCacheRecord;

const emptyProjects: DesignerProjectsResponse = {
  projects: [],
  page: 1,
  limit: 30,
  hasMore: false,
};

function resolveTo(
  profile = makeProfile(),
  portfolio: PortfolioRecord | null = makePortfolio(),
  orgSlug = 'test-studio-a1b2c3',
) {
  vi.mocked(portfolioRepository.findPublicBySlug).mockResolvedValue({
    profile,
    orgSlug,
    portfolio,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date('2026-07-25T00:00:00.000Z'));
  vi.mocked(projectsService.designerProjects).mockResolvedValue(emptyProjects);
  vi.mocked(projectsService.designerStartingBudget).mockResolvedValue(null);
  vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(null);
  vi.mocked(portfolioRepository.findCityLabels).mockResolvedValue([]);
  vi.mocked(portfolioRepository.findPublishedProjectTitle).mockResolvedValue(null);
  resolveTo();
});

describe('publicPortfolioService.getBySlug — visibility gate', () => {
  it('404s for an unknown slug', async () => {
    vi.mocked(portfolioRepository.findPublicBySlug).mockResolvedValue(null);

    await expect(publicPortfolioService.getBySlug('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('404s when the designer profile is not active', async () => {
    resolveTo(makeProfile({ status: 'suspended' }));

    await expect(publicPortfolioService.getBySlug('test-studio')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('404s — not 403 — when the designer switched the public link off', async () => {
    resolveTo(makeProfile(), makePortfolio({ publicLinkEnabled: false }));

    await expect(publicPortfolioService.getBySlug('test-studio')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('serves a designer who never opened portfolio settings, using column defaults', async () => {
    resolveTo(makeProfile(), null);

    const result = await publicPortfolioService.getBySlug('test-studio-a1b2c3');

    expect(result.sections).toEqual({
      hero: true,
      trustCredentials: true,
      featuredTestimonial: true,
      reviews: true,
      socialLinks: true,
      shareBlock: true,
      overallRating: true,
      tickifBadge: true,
    });
    expect(result.accentColor).toBe('#FF8F73');
    expect(result.tagline).toBeNull();
    expect(result.publishedAt).toBeNull();
  });
});

describe('publicPortfolioService.getBySlug — projection', () => {
  it('never exposes private contact fields', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('12 Private Lane');
    expect(serialized).not.toContain('+919000000000');
    expect(serialized).not.toContain('maps.google.com');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('address');
    expect(result).not.toHaveProperty('googleBusinessUrl');
    expect(result).not.toHaveProperty('staffCount');
    // The storage key is never handed out raw — only as a presigned URL.
    expect(result).not.toHaveProperty('logoImageId');
  });

  it('presigns the logo for display', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.logoUrl).toBe('https://cdn.test/originals/logos/profile-1/abc');
  });

  it('refuses to sign a logo key belonging to another profile', async () => {
    resolveTo(makeProfile({ logoImageId: 'originals/logos/other-profile/abc' }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.logoUrl).toBeNull();
  });

  it('prefers the designer-chosen slug in the canonical URL', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio-a1b2c3');

    expect(result.slug).toBe('test-studio-a1b2c3');
    expect(result.canonicalUrl).toBe('http://localhost:3000/d/test-studio');
  });

  it('falls back to the org slug when no portfolio slug is set', async () => {
    resolveTo(makeProfile(), makePortfolio({ portfolioSlug: null }));

    const result = await publicPortfolioService.getBySlug('test-studio-a1b2c3');

    expect(result.canonicalUrl).toBe('http://localhost:3000/d/test-studio-a1b2c3');
  });

  it('withholds social links when the designer hid that section', async () => {
    resolveTo(makeProfile(), makePortfolio({ showSocialLinks: false }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.social).toEqual({
      websiteUrl: null,
      instagramHandle: null,
      linkedinHandle: null,
      youtubeHandle: null,
    });
  });

  it('withholds badges when the designer hid the credentials section', async () => {
    resolveTo(makeProfile(), makePortfolio({ showTrustCredentials: false }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.badges).toEqual([]);
  });

  it('surfaces the earned badges when credentials are shown', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio');

    // Active profile + 6 years experience → verified + established, nothing else.
    expect(result.badges).toEqual(['verified', 'established']);
  });

  it('exposes city footprint labels but not the street address', async () => {
    vi.mocked(portfolioRepository.findCityLabels).mockResolvedValue(['Chennai', 'Coimbatore']);

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.cities).toEqual(['Chennai', 'Coimbatore']);
  });

  it('does not re-verify the designer when fetching the embedded project page', async () => {
    await publicPortfolioService.getBySlug('test-studio');

    expect(projectsService.designerProjects).toHaveBeenCalledWith(
      'profile-1',
      { page: 1, limit: 30 },
      { skipDesignerCheck: true },
    );
  });
});

describe('publicPortfolioService.getBySlug — reviews', () => {
  it('serves cached Google reviews and prefers Google’s aggregate rating', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(makeGoogleRow());

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviewSource).toBe('google');
    expect(result.reviews).toEqual([
      {
        id: 'google-1770000000-0',
        author: 'Rahul S.',
        avatarUrl: 'https://lh3.google.test/a/rahul',
        rating: 5,
        relativeTime: '2 weeks ago',
        text: 'Wonderful to work with.',
        source: 'google',
      },
    ]);
    expect(result.stats.rating).toBe(4.8);
    expect(result.stats.reviewCount).toBe(57);
  });

  it('falls back to the Tickif profile rating when no place is connected', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviewSource).toBeNull();
    expect(result.reviews).toEqual([]);
    expect(result.stats.rating).toBe(4.2);
    expect(result.stats.reviewCount).toBe(8);
  });

  it('withholds the aggregate rating when the designer hid it, rather than leaving it to the client', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(makeGoogleRow());
    resolveTo(makeProfile(), makePortfolio({ showOverallRating: false }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.sections.overallRating).toBe(false);
    expect(result.stats.rating).toBe(0);
    expect(result.stats.reviewCount).toBe(0);
    // The review list is a separate toggle and stays on.
    expect(result.reviews).toHaveLength(1);
  });

  it('withholds review content past the 30-day Places ToS window', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(
      makeGoogleRow({ lastFetchedAt: new Date('2026-05-01T00:00:00.000Z') }),
    );

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviews).toEqual([]);
    expect(result.reviewSource).toBeNull();
    // The stale row must not leak Google's rating either.
    expect(result.stats.rating).toBe(4.2);
  });

  it('withholds review content while a connection is still pending', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(
      makeGoogleRow({ status: 'pending', reviews: [makeGoogleReview()] }),
    );

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviews).toEqual([]);
  });

  it('hides all reviews when the designer hid the reviews section', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(makeGoogleRow());
    resolveTo(makeProfile(), makePortfolio({ showReviews: false }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviews).toEqual([]);
    expect(result.reviewSource).toBeNull();
  });

  it('drops sub-4-star reviews when showPositiveReviewsOnly is on', async () => {
    vi.mocked(googleReviewsRepository.findByProfileId).mockResolvedValue(
      makeGoogleRow({
        reviews: [
          makeGoogleReview({ rating: 5, author: 'Keep Me', time: 1 }),
          makeGoogleReview({ rating: 4, author: 'Keep Me Too', time: 2 }),
          makeGoogleReview({ rating: 3, author: 'Drop Me', time: 3 }),
        ],
      }),
    );
    resolveTo(makeProfile(), makePortfolio({ showPositiveReviewsOnly: true }));

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.reviews.map((r) => r.author)).toEqual(['Keep Me', 'Keep Me Too']);
  });
});

describe('publicPortfolioService.getBySlug — featured testimonial', () => {
  it('returns the curated quote with its linked project title', async () => {
    resolveTo(
      makeProfile(),
      makePortfolio({
        testimonialWords: 'They understood our family first.',
        testimonialAuthor: 'Priya & Rohan K.',
        testimonialProjectId: 'project-9',
      }),
    );
    vi.mocked(portfolioRepository.findPublishedProjectTitle).mockResolvedValue('Adyar Penthouse');

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.testimonial).toEqual({
      words: 'They understood our family first.',
      author: 'Priya & Rohan K.',
      projectTitle: 'Adyar Penthouse',
    });
  });

  it('drops the project title when the linked project is no longer published', async () => {
    resolveTo(
      makeProfile(),
      makePortfolio({
        testimonialWords: 'Great work.',
        testimonialProjectId: 'project-9',
      }),
    );
    vi.mocked(portfolioRepository.findPublishedProjectTitle).mockResolvedValue(null);

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.testimonial).toEqual({
      words: 'Great work.',
      author: null,
      projectTitle: null,
    });
  });

  it('returns null when the quote is unset', async () => {
    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.testimonial).toBeNull();
  });

  it('returns null when the designer hid the testimonial section', async () => {
    resolveTo(
      makeProfile(),
      makePortfolio({ testimonialWords: 'Great work.', showFeaturedTestimonial: false }),
    );

    const result = await publicPortfolioService.getBySlug('test-studio');

    expect(result.testimonial).toBeNull();
    // Skipped entirely — no wasted project lookup.
    expect(portfolioRepository.findPublishedProjectTitle).not.toHaveBeenCalled();
  });
});
