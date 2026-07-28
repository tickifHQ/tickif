import type {
  DesignerProjectCard,
  PublicPortfolioResponse,
  PublicPortfolioReview,
} from '@repo/contracts';

/**
 * Contract-shaped builders for the public portfolio page.
 *
 * These mirror `PublicPortfolioResponse` exactly, so a change to the API
 * contract breaks these tests at compile time rather than at runtime.
 */

export function makeProject(overrides: Partial<DesignerProjectCard> = {}): DesignerProjectCard {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'adyar-penthouse',
    title: 'Adyar Penthouse',
    studio: 'Anika Spaces',
    city: 'Chennai',
    locality: 'Adyar',
    rating: 4.8,
    reviewCount: 42,
    budget: '₹35–42L',
    tags: ['4 BHK', 'Full home'],
    coverImageUrl: 'https://cdn.example.test/projects/adyar.jpg',
    imageWidth: 1600,
    imageHeight: 2000,
    propertyType: '4 BHK · Apartment',
    completionYear: 2024,
    sizeSqft: 2400,
    ...overrides,
  };
}

export function makeReview(overrides: Partial<PublicPortfolioReview> = {}): PublicPortfolioReview {
  return {
    id: 'google-1738368000-0',
    author: 'Rahul S.',
    avatarUrl: 'https://cdn.example.test/avatars/rahul.png',
    rating: 4.5,
    relativeTime: '3 months ago',
    text: 'Anika and her team understood what we wanted before we could properly explain it.',
    source: 'google',
    ...overrides,
  };
}

export function makePublicPortfolio(
  overrides: Partial<PublicPortfolioResponse> = {},
): PublicPortfolioResponse {
  return {
    profileId: '22222222-2222-4222-8222-222222222222',
    slug: 'anika-spaces',
    canonicalUrl: 'http://localhost:3000/d/anika-spaces',
    displayName: 'Anika Spaces',
    entityType: 'company',
    tagline: 'Quiet, light-filled homes with timeless materials.',
    bio: 'A boutique residential design studio led by Anika Subramanian.',
    firmType: 'Interior Design Studio',
    foundedYear: 2018,
    cities: ['Chennai'],
    logoUrl: null,
    accentColor: '#FF8F73',
    badges: ['verified', 'established'],
    sections: {
      hero: true,
      trustCredentials: true,
      featuredTestimonial: true,
      reviews: true,
      socialLinks: true,
      shareBlock: true,
      overallRating: true,
      tickifBadge: true,
    },
    stats: {
      tickif: { rating: 4.7, reviewCount: 42 },
      google: { rating: 4.8, reviewCount: 57 },
      projectCount: 28,
      yearsExperience: 8,
      startingBudget: '₹10L+',
    },
    reviewVisibility: {
      tickif: { reviews: true, overallRating: true },
      google: { reviews: true, overallRating: true },
    },
    social: {
      websiteUrl: 'https://anikaspaces.in',
      instagramHandle: 'anika',
      linkedinHandle: 'anika',
      youtubeHandle: null,
    },
    testimonial: {
      words: 'They understood our family before they understood our floor plan.',
      author: 'Priya & Rohan K.',
      projectTitle: 'Adyar Penthouse',
    },
    reviews: [makeReview()],
    projects: {
      projects: [makeProject()],
      page: 1,
      limit: 30,
      hasMore: false,
    },
    publishedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A portfolio with `count` distinct projects, for gallery reveal/pagination tests. */
export function makeProjects(count: number): DesignerProjectCard[] {
  return Array.from({ length: count }, (_, index) =>
    makeProject({
      id: `1111111${index}-1111-4111-8111-111111111111`,
      slug: `project-${index}`,
      title: `Project ${index}`,
      completionYear: 2020 + index,
      sizeSqft: 1000 + index * 100,
      rating: 4 + (index % 10) / 10,
      propertyType: index % 2 === 0 ? '4 BHK · Apartment' : '4 BHK · Villa',
    }),
  );
}
