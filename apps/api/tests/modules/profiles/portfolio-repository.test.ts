import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortfolioRecord } from '../../../src/modules/profiles/portfolio-repository.js';

// Mock the database layer
vi.mock('@repo/db', () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.onConflictDoUpdate = vi.fn().mockReturnValue(chain);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.set = vi.fn().mockReturnValue(chain);
    return chain;
  };

  const dbInstance = mockChain();
  // Add transaction support
  dbInstance.transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn(mockChain());
  });

  return {
    db: dbInstance,
    schema: {
      designerPortfolio: {
        id: 'designer_portfolio.id',
        profileId: 'designer_portfolio.profile_id',
        portfolioSlug: 'designer_portfolio.portfolio_slug',
      },
      designerProfile: {
        id: 'designer_profile.id',
        orgId: 'designer_profile.org_id',
        userId: 'designer_profile.user_id',
        status: 'designer_profile.status',
      },
      organization: {
        id: 'organization.id',
        slug: 'organization.slug',
      },
      project: {
        id: 'project.id',
        designerId: 'project.designer_id',
        status: 'project.status',
      },
    },
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
    sql: vi.fn(),
  };
});

// Import AFTER mock registration
const { portfolioRepository } = await import(
  '../../../src/modules/profiles/portfolio-repository.js'
);
const { db } = await import('@repo/db');

const mockPortfolioRow = (overrides: Partial<PortfolioRecord> = {}): PortfolioRecord => ({
  id: 'portfolio-1',
  profileId: 'profile-1',
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
  testimonialWords: null,
  testimonialAuthor: null,
  testimonialProjectId: null,
  testimonialUpdatedAt: null,
  showOverallRating: true,
  showPositiveReviewsOnly: false,
  showTickifReviews: true,
  showTickifOverallRating: true,
  showTickifPositiveReviewsOnly: false,
  showGoogleReviews: true,
  showGoogleOverallRating: true,
  showGooglePositiveReviewsOnly: false,
  showTickifBadge: true,
  publishedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe('portfolioRepository', () => {
  describe('findByProfileId', () => {
    it('returns the portfolio record when found', async () => {
      const row = mockPortfolioRow();
      vi.mocked(db.select().from(undefined as never).where(undefined as never).limit as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([row]);

      const result = await portfolioRepository.findByProfileId('profile-1');
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      const result = await portfolioRepository.findByProfileId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findBySlug', () => {
    it('returns the portfolio record when slug matches', async () => {
      const row = mockPortfolioRow({ portfolioSlug: 'my-studio' });
      vi.mocked(db.select().from(undefined as never).where(undefined as never).limit as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([row]);

      const result = await portfolioRepository.findBySlug('my-studio');
      expect(result).toEqual(row);
    });

    it('returns null when slug not found', async () => {
      const result = await portfolioRepository.findBySlug('nonexistent-slug');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('inserts with defaults and returns the new record', async () => {
      const newRow = mockPortfolioRow({ profileId: 'profile-2' });
      vi.mocked(
        db.insert(undefined as never).values(undefined as never).returning as ReturnType<typeof vi.fn>,
      ).mockResolvedValueOnce([newRow]);

      const result = await portfolioRepository.create('profile-2');
      expect(result).toEqual(newRow);
    });

    it('throws when insert returns no row', async () => {
      vi.mocked(
        db.insert(undefined as never).values(undefined as never).returning as ReturnType<typeof vi.fn>,
      ).mockResolvedValueOnce([]);

      await expect(portfolioRepository.create('profile-3')).rejects.toThrow(
        'insert returned no row',
      );
    });
  });

  describe('isSlugAvailable', () => {
    it('returns false for reserved slugs', async () => {
      const result = await portfolioRepository.isSlugAvailable('admin');
      expect(result).toBe(false);
    });

    it('returns false for all known reserved slugs', async () => {
      const reservedList = [
        'admin', 'api', 'login', 'designer', 'dashboard', 'auth', 'help',
        'support', 'pricing', 'projects', 'settings', 'profile', 'portfolio',
      ];
      for (const slug of reservedList) {
        const result = await portfolioRepository.isSlugAvailable(slug);
        expect(result).toBe(false);
      }
    });

    it('returns true when slug is not in use (DB returns no rows)', async () => {
      // Default mock returns empty array
      const result = await portfolioRepository.isSlugAvailable('unique-slug');
      expect(result).toBe(true);
    });

    it('returns false when slug is taken by another profile (DB returns a row)', async () => {
      vi.mocked(db.select().from(undefined as never).where(undefined as never).limit as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ id: 'other-portfolio' }]);

      const result = await portfolioRepository.isSlugAvailable('taken-slug');
      expect(result).toBe(false);
    });

    it('excludes own profile when checking availability (self-exclusion)', async () => {
      // Even with a row existing, if it's the caller's own profile it's available
      const result = await portfolioRepository.isSlugAvailable('my-slug', 'profile-1');
      // With the default empty mock, it should be true (no other profile has it)
      expect(result).toBe(true);
    });

    // `findPublicBySlug` resolves /d/{slug} against portfolio_slug OR organization.slug,
    // so a slug free in the portfolio table can still be another org's live public URL.
    it('returns false when the slug is another organization’s slug', async () => {
      const limit = vi.mocked(
        db.select().from(undefined as never).where(undefined as never).limit as ReturnType<
          typeof vi.fn
        >,
      );
      limit
        .mockResolvedValueOnce([]) // no portfolio holds it
        .mockResolvedValueOnce([{ id: 'org-other' }]); // but an organization does

      const result = await portfolioRepository.isSlugAvailable('acme-interiors');
      expect(result).toBe(false);
    });

    it('checks both namespaces before reporting a slug free', async () => {
      const limit = vi.mocked(
        db.select().from(undefined as never).where(undefined as never).limit as ReturnType<
          typeof vi.fn
        >,
      );
      limit.mockClear();

      const result = await portfolioRepository.isSlugAvailable('genuinely-free');

      expect(result).toBe(true);
      expect(limit).toHaveBeenCalledTimes(3);
    });
  });

  describe('isReservedSlug', () => {
    it('returns true for reserved words', () => {
      expect(portfolioRepository.isReservedSlug('admin')).toBe(true);
      expect(portfolioRepository.isReservedSlug('api')).toBe(true);
      expect(portfolioRepository.isReservedSlug('login')).toBe(true);
      expect(portfolioRepository.isReservedSlug('dashboard')).toBe(true);
      expect(portfolioRepository.isReservedSlug('portfolio')).toBe(true);
      expect(portfolioRepository.isReservedSlug('app')).toBe(true);
    });

    it('returns false for non-reserved words', () => {
      expect(portfolioRepository.isReservedSlug('my-studio')).toBe(false);
      expect(portfolioRepository.isReservedSlug('design-works')).toBe(false);
      expect(portfolioRepository.isReservedSlug('creative-space')).toBe(false);
    });
  });
});
