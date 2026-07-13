import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortfolioRecord } from '../../../src/modules/profiles/portfolio-repository.js';
import type { DesignerProfileRecord } from '../../../src/modules/profiles/repository.js';

// --- Mocks ---

vi.mock('../../../src/modules/profiles/portfolio-repository.js', () => ({
  portfolioRepository: {
    findByProfileId: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    upsertInTx: vi.fn(),
    update: vi.fn(),
    isSlugAvailable: vi.fn(),
    isSlugAvailableInTx: vi.fn(),
    isReservedSlug: vi.fn(),
    findProfileByUserId: vi.fn(),
    findProjectForDesigner: vi.fn(),
    findProjectForDesignerInTx: vi.fn(),
    updateProfileInTx: vi.fn(),
  },
  withTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({});
  }),
}));

vi.mock('../../../src/modules/profiles/repository.js', () => ({
  profilesRepository: {
    findByOrgId: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

vi.mock('../../../src/modules/orgs/repository.js', () => ({
  isOrgWriter: vi.fn(),
}));

vi.mock('@repo/storage', () => ({
  presignUpload: vi.fn(),
  presignDownload: vi.fn(),
  objectExists: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('@repo/config', () => ({
  config: {
    PUBLIC_WEB_URL: 'https://tickif.com',
    R2_UPLOAD_URL_EXPIRY_SECONDS: 600,
  },
}));

// Import AFTER mock registration
const { portfolioService } = await import(
  '../../../src/modules/profiles/portfolio-service.js'
);
const { portfolioRepository } = await import(
  '../../../src/modules/profiles/portfolio-repository.js'
);
const { profilesRepository } = await import(
  '../../../src/modules/profiles/repository.js'
);
const { isOrgWriter } = await import('../../../src/modules/orgs/repository.js');
const { presignUpload, presignDownload, objectExists, deleteObject } = await import(
  '@repo/storage'
);

// --- Factories ---

const makeProfile = (over: Partial<DesignerProfileRecord> = {}): DesignerProfileRecord => ({
  id: 'profile-1',
  orgId: 'org-1',
  userId: 'user-1',
  entityType: 'individual',
  displayName: 'Test Studio',
  bio: 'We design beautiful spaces',
  logoImageId: 'originals/logos/profile-1/abc',
  status: 'active',
  yearsExperience: 5,
  projectCount: 0,
  shareCount: 0,
  avgRating: '0',
  reviewCount: 0,
  websiteUrl: null,
  googleBusinessUrl: null,
  phone: null,
  address: null,
  instagramHandle: null,
  linkedinHandle: null,
  youtubeHandle: null,
  firmType: null,
  foundedYear: null,
  testimonialBannerEnabled: false,
  staffCount: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...over,
});

const makePortfolio = (over: Partial<PortfolioRecord> = {}): PortfolioRecord => ({
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
  ...over,
});

const caller = { userId: 'user-1', activeOrgId: 'org-1' };

/** Setup happy-path mocks so resolveProfile + getPortfolio work. */
function setupResolveProfile(profile = makeProfile()) {
  vi.mocked(isOrgWriter).mockResolvedValue(true);
  vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profile);
  return profile;
}

function setupGetPortfolio(portfolio = makePortfolio()) {
  vi.mocked(portfolioRepository.findByProfileId).mockResolvedValue(portfolio);
  return portfolio;
}

beforeEach(() => vi.clearAllMocks());

// =============================================================================
// updatePortfolio
// =============================================================================

describe('portfolioService.updatePortfolio', () => {
  it('throws 409 when slug is reserved', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(true);

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'admin' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This slug is reserved and cannot be used' });
  });

  it('throws 409 when slug is taken (isSlugAvailableInTx returns false)', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(false);
    vi.mocked(portfolioRepository.isSlugAvailableInTx).mockResolvedValue(false);

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'taken-slug' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This portfolio slug is already taken' });
  });

  it('throws 409 when unique constraint race occurs (upsertInTx throws 23505)', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(false);
    vi.mocked(portfolioRepository.isSlugAvailableInTx).mockResolvedValue(true);

    // Simulate the DB unique constraint violation
    const dbError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'designer_portfolio_portfolio_slug_unique',
    });
    vi.mocked(portfolioRepository.upsertInTx).mockRejectedValue(dbError);

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'race-slug' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This portfolio slug is already taken' });
  });

  it('throws 422 when testimonial project not found', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.findProjectForDesignerInTx).mockResolvedValue(null);

    await expect(
      portfolioService.updatePortfolio(
        { testimonialProjectId: 'nonexistent-project' },
        caller,
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Testimonial project not found or does not belong to you',
    });
  });

  it('throws 422 when testimonial project is not published', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.findProjectForDesignerInTx).mockResolvedValue({
      id: 'project-1',
      status: 'draft',
    });

    await expect(
      portfolioService.updatePortfolio(
        { testimonialProjectId: 'project-1' },
        caller,
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Testimonial project must be published',
    });
  });

  it('accepts null testimonialProjectId and sets testimonialUpdatedAt', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(
      makePortfolio({ testimonialProjectId: null }),
    );
    // getPortfolio is called after commit to return fresh state
    vi.mocked(portfolioRepository.findByProfileId).mockResolvedValue(
      makePortfolio({ testimonialProjectId: null }),
    );

    const result = await portfolioService.updatePortfolio(
      { testimonialProjectId: null },
      caller,
    );

    // Verify upsertInTx was called with testimonialUpdatedAt set
    expect(portfolioRepository.upsertInTx).toHaveBeenCalledWith(
      expect.anything(), // tx
      'profile-1',
      expect.objectContaining({ testimonialProjectId: null, testimonialUpdatedAt: expect.any(Date) }),
    );
    expect(result.testimonialProjectId).toBeNull();
  });

  it('successful update returns portfolio response', async () => {
    setupResolveProfile();
    setupGetPortfolio(makePortfolio({ portfolioSlug: 'my-studio' }));
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(
      makePortfolio({ tagline: 'New tagline', portfolioSlug: 'my-studio' }),
    );
    // After commit, getPortfolio re-fetches
    vi.mocked(portfolioRepository.findByProfileId).mockResolvedValue(
      makePortfolio({ tagline: 'New tagline', portfolioSlug: 'my-studio' }),
    );

    const result = await portfolioService.updatePortfolio({ tagline: 'New tagline' }, caller);

    expect(result).toMatchObject({
      id: 'portfolio-1',
      tagline: 'New tagline',
      portfolioUrl: 'https://tickif.com/p/my-studio',
    });
  });
});

// =============================================================================
// checkSlugAvailability
// =============================================================================

describe('portfolioService.checkSlugAvailability', () => {
  it('returns available: false for reserved slugs', async () => {
    setupResolveProfile();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(true);

    const result = await portfolioService.checkSlugAvailability('admin', caller);

    expect(result).toEqual({ slug: 'admin', available: false });
  });

  it('returns available: true for available slugs', async () => {
    setupResolveProfile();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(false);
    vi.mocked(portfolioRepository.isSlugAvailable).mockResolvedValue(true);

    const result = await portfolioService.checkSlugAvailability('unique-name', caller);

    expect(result).toEqual({ slug: 'unique-name', available: true });
  });
});

// =============================================================================
// createLogoUploadUrl
// =============================================================================

describe('portfolioService.createLogoUploadUrl', () => {
  it('returns uploadUrl and key for valid input', async () => {
    setupResolveProfile();
    vi.mocked(presignUpload).mockResolvedValue('https://r2.example.com/presigned-put');

    const result = await portfolioService.createLogoUploadUrl(
      { contentType: 'image/png', contentLength: 500_000 },
      caller,
    );

    expect(result.uploadUrl).toBe('https://r2.example.com/presigned-put');
    expect(result.key).toMatch(/^originals\/logos\/profile-1\//);
  });

  it('throws 422 for invalid content type', async () => {
    setupResolveProfile();

    await expect(
      portfolioService.createLogoUploadUrl(
        { contentType: 'application/pdf', contentLength: 100_000 },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422, message: 'Unsupported content type for logo upload' });
  });

  it('throws 422 for oversized content', async () => {
    setupResolveProfile();

    await expect(
      portfolioService.createLogoUploadUrl(
        { contentType: 'image/jpeg', contentLength: 6_000_000 },
        caller,
      ),
    ).rejects.toMatchObject({ status: 422, message: 'Declared size exceeds the logo size limit' });
  });
});

// =============================================================================
// commitLogoUpload
// =============================================================================

describe('portfolioService.commitLogoUpload', () => {
  it('returns logoUrl when object exists', async () => {
    setupResolveProfile();
    vi.mocked(objectExists).mockResolvedValue(true);
    vi.mocked(profilesRepository.updateProfile).mockResolvedValue(makeProfile());
    vi.mocked(presignDownload).mockResolvedValue('https://r2.example.com/presigned-get');

    const result = await portfolioService.commitLogoUpload(
      { objectKey: 'originals/logos/profile-1/uuid' },
      caller,
    );

    expect(result.logoUrl).toBe('https://r2.example.com/presigned-get');
    expect(profilesRepository.updateProfile).toHaveBeenCalledWith('profile-1', {
      logoImageId: 'originals/logos/profile-1/uuid',
    });
  });

  it('throws 400 when object not found in storage', async () => {
    setupResolveProfile();
    vi.mocked(objectExists).mockResolvedValue(false);

    await expect(
      portfolioService.commitLogoUpload(
        { objectKey: 'originals/logos/profile-1/missing' },
        caller,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// =============================================================================
// deleteLogo
// =============================================================================

describe('portfolioService.deleteLogo', () => {
  it('clears DB when logo exists and storage succeeds', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/key' }));
    vi.mocked(deleteObject).mockResolvedValue(undefined);
    vi.mocked(profilesRepository.updateProfile).mockResolvedValue(
      makeProfile({ logoImageId: null }),
    );

    await portfolioService.deleteLogo(caller);

    expect(deleteObject).toHaveBeenCalledWith('originals/logos/profile-1/key');
    expect(profilesRepository.updateProfile).toHaveBeenCalledWith('profile-1', {
      logoImageId: null,
    });
  });

  it('throws 404 when no logo exists', async () => {
    setupResolveProfile(makeProfile({ logoImageId: null }));

    await expect(portfolioService.deleteLogo(caller)).rejects.toMatchObject({
      status: 404,
      message: 'No logo exists to delete',
    });
  });

  it('throws 500 and does NOT clear DB when storage fails', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/key' }));
    vi.mocked(deleteObject).mockRejectedValue(new Error('S3 network error'));

    await expect(portfolioService.deleteLogo(caller)).rejects.toMatchObject({ status: 500 });

    // DB must not be modified
    expect(profilesRepository.updateProfile).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Audit events
// =============================================================================

describe('audit event emission', () => {
  it('emits audit event after updatePortfolio', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());
    vi.mocked(portfolioRepository.findByProfileId).mockResolvedValue(makePortfolio());

    await portfolioService.updatePortfolio({ tagline: 'Hello' }, caller);

    expect(consoleSpy).toHaveBeenCalled();
    const emitted = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(emitted).toMatchObject({
      userId: 'user-1',
      activeOrgId: 'org-1',
      action: 'portfolio.updated',
      resourceId: 'profile-1',
      changedFields: ['tagline'],
    });
    expect(emitted.timestamp).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('mutation still succeeds even when audit emission throws', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('logging broken');
    });
    // Suppress console.error noise from the catch block
    vi.spyOn(console, 'error').mockImplementation(() => {});

    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());
    vi.mocked(portfolioRepository.findByProfileId).mockResolvedValue(makePortfolio());

    // Should not throw despite audit failure
    const result = await portfolioService.updatePortfolio({ tagline: 'Test' }, caller);
    expect(result).toBeDefined();
    expect(result.id).toBe('portfolio-1');

    consoleSpy.mockRestore();
  });
});
