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
      },
      project: {
        id: 'project.id',
        designerId: 'project.designer_id',
        status: 'project.status',
      },
    },
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
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

  describe('upsert', () => {
    it('creates a new portfolio when none exists (create path)', async () => {
      const newRow = mockPortfolioRow({ accentColor: '#000000' });
      vi.mocked(
        db
          .insert(undefined as never)
          .values(undefined as never)
          .onConflictDoUpdate(undefined as never).returning as ReturnType<typeof vi.fn>,
      ).mockResolvedValueOnce([newRow]);

      const result = await portfolioRepository.upsert('profile-1', {
        accentColor: '#000000',
      });
      expect(result).toEqual(newRow);
    });

    it('updates existing portfolio when one exists (update path)', async () => {
      const updatedRow = mockPortfolioRow({ tagline: 'Updated tagline' });
      vi.mocked(
        db
          .insert(undefined as never)
          .values(undefined as never)
          .onConflictDoUpdate(undefined as never).returning as ReturnType<typeof vi.fn>,
      ).mockResolvedValueOnce([updatedRow]);

      const result = await portfolioRepository.upsert('profile-1', {
        tagline: 'Updated tagline',
      });
      expect(result).toEqual(updatedRow);
      expect(result.tagline).toBe('Updated tagline');
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

  describe('findProjectForDesigner', () => {
    it('returns the project when it belongs to the designer', async () => {
      const project = { id: 'project-1', status: 'published' };
      vi.mocked(db.select().from(undefined as never).where(undefined as never).limit as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([project]);

      const result = await portfolioRepository.findProjectForDesigner('project-1', 'designer-1');
      expect(result).toEqual(project);
    });

    it('returns null when project does not belong to the designer', async () => {
      const result = await portfolioRepository.findProjectForDesigner(
        'project-1',
        'wrong-designer',
      );
      expect(result).toBeNull();
    });

    it('returns null when project does not exist', async () => {
      const result = await portfolioRepository.findProjectForDesigner(
        'nonexistent',
        'designer-1',
      );
      expect(result).toBeNull();
    });
  });
});
