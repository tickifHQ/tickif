import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortfolioResponse } from '@repo/contracts';

// --- Mocks ---

vi.mock('../../../src/modules/profiles/portfolio-service.js', () => ({
  portfolioService: {
    getPortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
    checkSlugAvailability: vi.fn(),
    createLogoUploadUrl: vi.fn(),
    commitLogoUpload: vi.fn(),
    deleteLogo: vi.fn(),
  },
}));

vi.mock('../../../src/modules/profiles/service.js', () => ({
  profilesService: {},
}));

vi.mock('../../../src/modules/dashboard/service.js', () => ({
  dashboardService: {},
}));

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
  getSession: vi.fn(),
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
const { portfolioService } = await import(
  '../../../src/modules/profiles/portfolio-service.js'
);
const { getSession } = await import('@repo/auth');
const { app } = await import('../../../src/app.js');

// --- Factories ---

const fakePortfolioResponse: PortfolioResponse = {
  id: 'portfolio-1',
  publicLinkEnabled: true,
  portfolioSlug: null,
  accentColor: '#FF8F73',
  showHero: true,
  showTrustCredentials: true,
  showFeaturedTestimonial: true,
  showReviews: true,
  showSocialLinks: true,
  showShareBlock: true,
  tagline: null,
  displayName: 'Test Studio',
  bio: null,
  logoUrl: null,
  websiteUrl: null,
  instagramHandle: null,
  linkedinHandle: null,
  youtubeHandle: null,
  testimonialWords: null,
  testimonialAuthor: null,
  testimonialProjectId: null,
  showOverallRating: true,
  showPositiveReviewsOnly: false,
  showTickifBadge: true,
  badges: [],
  portfolioUrl: null,
  publishedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function mockAuthed() {
  vi.mocked(getSession).mockResolvedValue({
    user: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@test.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'designer',
      banned: false,
      banExpires: null,
      banReason: null,
      image: null,
      status: 'active',
      phoneNumber: null,
      phoneNumberVerified: false,
    },
    session: {
      id: 'session-1',
      userId: 'user-1',
      token: 'token-1',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      activeOrganizationId: 'org-1',
      impersonatedBy: null,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

async function request(method: string, path: string, opts?: { body?: unknown }) {
  return app.request(`/api/profiles${path}`, {
    method,
    headers: {
      ...(opts?.body ? { 'content-type': 'application/json' } : {}),
      cookie: 'better-auth.session_token=mock-token',
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

beforeEach(() => vi.clearAllMocks());

// =============================================================================
// Slug boundary validation (via slug-check endpoint — Zod validation at route level)
// =============================================================================

describe('slug boundary validation', () => {
  it('accepts slug at exactly 3 characters (minimum)', async () => {
    mockAuthed();
    vi.mocked(portfolioService.checkSlugAvailability).mockResolvedValue({
      slug: 'abc',
      available: true,
    });

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: 'abc' },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ slug: 'abc', available: true });
  });

  it('accepts slug at exactly 60 characters (maximum)', async () => {
    // Build a valid 60-char slug: "a" + "-b" repeated 29 times + "c" = 1 + 58 + 1 = 60
    const slug = 'a' + '-b'.repeat(29) + 'c';
    expect(slug.length).toBe(60);

    mockAuthed();
    vi.mocked(portfolioService.checkSlugAvailability).mockResolvedValue({
      slug,
      available: true,
    });

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.available).toBe(true);
  });

  it('rejects slug with leading hyphen (Zod regex)', async () => {
    mockAuthed();

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: '-leading' },
    });

    expect(res.status).toBe(422);
  });

  it('rejects slug with trailing hyphen (Zod regex)', async () => {
    mockAuthed();

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: 'trailing-' },
    });

    expect(res.status).toBe(422);
  });

  it('rejects slug shorter than 3 characters', async () => {
    mockAuthed();

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: 'ab' },
    });

    expect(res.status).toBe(422);
  });

  it('rejects slug with uppercase letters', async () => {
    mockAuthed();

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: 'MyStudio' },
    });

    expect(res.status).toBe(422);
  });

  it('rejects slug with consecutive hyphens', async () => {
    mockAuthed();

    const res = await request('POST', '/me/portfolio/slug-check', {
      body: { slug: 'my--studio' },
    });

    expect(res.status).toBe(422);
  });
});

// =============================================================================
// Empty PATCH body (no-op)
// =============================================================================

describe('empty PATCH body', () => {
  it('succeeds with empty body and returns current state', async () => {
    mockAuthed();
    vi.mocked(portfolioService.updatePortfolio).mockResolvedValue(fakePortfolioResponse);

    const res = await request('PATCH', '/me/portfolio', {
      body: {},
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.id).toBe('portfolio-1');
  });
});

// =============================================================================
// Concurrent slug claims (service-level race mapped to 409)
// =============================================================================

describe('concurrent slug claims', () => {
  it('returns 409 when service throws unique constraint conflict', async () => {
    mockAuthed();
    const { AppError } = await import('../../../src/lib/errors.js');
    vi.mocked(portfolioService.updatePortfolio).mockRejectedValue(
      AppError.conflict('This portfolio slug is already taken'),
    );

    const res = await request('PATCH', '/me/portfolio', {
      body: { portfolioSlug: 'race-slug' },
    });

    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toBe('This portfolio slug is already taken');
  });
});

// =============================================================================
// Portfolio access with no active org (422)
// =============================================================================

describe('portfolio access with no active org', () => {
  it('returns 422 when service throws no active organization error', async () => {
    mockAuthed();
    const { AppError } = await import('../../../src/lib/errors.js');
    vi.mocked(portfolioService.getPortfolio).mockRejectedValue(
      AppError.unprocessable('No active organization selected'),
    );

    const res = await request('GET', '/me/portfolio');

    expect(res.status).toBe(422);
    const body = await json(res);
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toBe('No active organization selected');
  });
});
