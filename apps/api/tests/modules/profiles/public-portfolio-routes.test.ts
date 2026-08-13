import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PublicPortfolioResponse } from '@repo/contracts';

// --- Mocks ---

vi.mock('../../../src/modules/profiles/public-portfolio-service.js', () => ({
  publicPortfolioService: { getBySlug: vi.fn() },
}));

vi.mock('../../../src/modules/profiles/portfolio-service.js', () => ({
  portfolioService: {},
}));

vi.mock('../../../src/modules/profiles/service.js', () => ({ profilesService: {} }));
vi.mock('../../../src/modules/dashboard/service.js', () => ({ dashboardService: {} }));

vi.mock('../../../src/modules/projects/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { projectsRoutes: new OpenAPIHono() };
});

vi.mock('../../../src/modules/media/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { mediaRoutes: new OpenAPIHono(), projectImagesRoutes: new OpenAPIHono() };
});

vi.mock('../../../src/modules/taxonomy/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { taxonomyRoutes: new OpenAPIHono() };
});

vi.mock('../../../src/modules/leads/routes.js', async () => {
  const { OpenAPIHono } = await import('@hono/zod-openapi');
  return { leadsRoutes: new OpenAPIHono() };
});

vi.mock('@repo/auth', () => ({
  getSession: vi.fn(async () => null),
  getSessionWithHeaders: vi.fn(async () => ({ session: null, headers: new Headers() })),
  auth: { handler: vi.fn(() => new Response(null, { status: 404 })) },
}));

vi.mock('@repo/config', () => ({
  config: {
    PUBLIC_WEB_URL: 'https://tickif.com',
    TRUSTED_ORIGINS: [],
    NEXT_PUBLIC_API_URL: 'http://localhost:3001',
  },
  isProduction: false,
  isDevelopment: false,
  isTest: true,
}));

// Import AFTER mock registration
const { publicPortfolioService } = await import(
  '../../../src/modules/profiles/public-portfolio-service.js'
);
const { AppError } = await import('../../../src/lib/errors.js');
const { app } = await import('../../../src/app.js');

const fakePortfolio: PublicPortfolioResponse = {
  profileId: '22222222-2222-4222-8222-222222222222',
  slug: 'test-studio',
  canonicalUrl: 'https://tickif.com/d/test-studio',
  displayName: 'Test Studio',
  entityType: 'company',
  tagline: 'Quiet, light-filled homes',
  bio: 'We design beautiful spaces',
  firmType: 'Interior Design Studio',
  foundedYear: 2019,
  cities: ['Chennai'],
  logoUrl: null,
  accentColor: '#FF8F73',
  badges: ['verified'],
  isKycVerified: true,
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
    tickif: { rating: 4.2, reviewCount: 8 },
    google: { rating: 4.8, reviewCount: 57 },
    projectCount: 12,
    yearsExperience: 6,
    startingBudget: '₹10L+',
  },
  reviewVisibility: {
    tickif: { reviews: true, overallRating: true },
    google: { reviews: true, overallRating: true },
  },
  social: {
    websiteUrl: null,
    instagramHandle: null,
    linkedinHandle: null,
    youtubeHandle: null,
  },
  testimonial: null,
  reviews: [],
  projects: { projects: [], page: 1, limit: 30, hasMore: false },
  publishedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/portfolios/{slug}', () => {
  it('serves the portfolio payload to anonymous visitors', async () => {
    vi.mocked(publicPortfolioService.getBySlug).mockResolvedValue(fakePortfolio);

    const res = await app.request('/api/portfolios/test-studio');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ displayName: 'Test Studio' });
    expect(publicPortfolioService.getBySlug).toHaveBeenCalledWith('test-studio');
  });

  it('sets a public cache policy so share-link traffic does not hit the DB every time', async () => {
    vi.mocked(publicPortfolioService.getBySlug).mockResolvedValue(fakePortfolio);

    const res = await app.request('/api/portfolios/test-studio');

    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
  });

  it('propagates the service 404 through the standard error envelope', async () => {
    vi.mocked(publicPortfolioService.getBySlug).mockRejectedValue(
      AppError.notFound('Portfolio not found'),
    );

    const res = await app.request('/api/portfolios/missing-studio');

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { message: 'Portfolio not found' },
    });
  });

  it('rejects a slug that is not URL-safe before reaching the service', async () => {
    const res = await app.request('/api/portfolios/Not_A_Slug');

    expect(res.status).toBe(422);
    expect(publicPortfolioService.getBySlug).not.toHaveBeenCalled();
  });

  it('does not require a session', async () => {
    vi.mocked(publicPortfolioService.getBySlug).mockResolvedValue(fakePortfolio);

    const res = await app.request('/api/portfolios/test-studio', {
      headers: { cookie: '' },
    });

    expect(res.status).toBe(200);
  });
});
