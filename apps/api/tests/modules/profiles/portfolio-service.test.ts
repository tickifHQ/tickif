import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortfolioRecord } from '../../../src/modules/profiles/portfolio-repository.js';
import type { DesignerProfileRecord } from '../../../src/modules/profiles/repository.js';

// --- Mocks ---

vi.mock('../../../src/modules/profiles/portfolio-repository.js', () => ({
  portfolioRepository: {
    findByProfileId: vi.fn(),
    findBySlug: vi.fn(),
    findPublicBySlug: vi.fn(),
    findPublishedProjectTitle: vi.fn(),
    findCityLabels: vi.fn(async () => []),
    // buildPortfolioResponse resolves the org slug to build the public /d/ URL.
    findOrgSlug: vi.fn(async () => 'anika-spaces-a1b2c3'),
    create: vi.fn(),
    findOrCreate: vi.fn(),
    findOrCreateInTx: vi.fn(),
    upsertInTx: vi.fn(),
    isSlugAvailable: vi.fn(),
    isSlugAvailableInTx: vi.fn(),
    isReservedSlug: vi.fn(),
    findProjectForDesignerInTx: vi.fn(),
    updateProfileInTx: vi.fn(),
    clearLogoIfMatch: vi.fn(),
    setLogoIfMatch: vi.fn(),
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

vi.mock('../../../src/modules/orgs/service.js', () => ({
  orgsService: {
    isWriter: vi.fn(),
  },
}));

// buildPortfolioResponse embeds a Google connection snapshot; default to "no row"
// so these unit tests never touch a real DB via the Google cache repository.
vi.mock('../../../src/modules/profiles/google-repository.js', () => ({
  googleReviewsRepository: {
    findByProfileId: vi.fn(async () => null),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@repo/storage', () => ({
  presignUpload: vi.fn(),
  presignDownload: vi.fn(),
  objectExists: vi.fn(),
  deleteObject: vi.fn(),
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
const { orgsService } = await import('../../../src/modules/orgs/service.js');
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
  vi.mocked(orgsService.isWriter).mockResolvedValue(true);
  vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profile);
  return profile;
}

function setupGetPortfolio(portfolio = makePortfolio()) {
  // getPortfolio uses findOrCreate; updatePortfolio ensures existence via
  // findOrCreateInTx (both non-mutating find-or-create patterns)
  vi.mocked(portfolioRepository.findOrCreate).mockResolvedValue(portfolio);
  vi.mocked(portfolioRepository.findOrCreateInTx).mockResolvedValue(portfolio);
  // logoUrl is resolved via presignDownload when profile has logoImageId
  vi.mocked(presignDownload).mockResolvedValue('https://r2.example.com/presigned-get');
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
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'admin' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This slug is reserved and cannot be used' });
  });

  it('throws 409 when slug is taken (isSlugAvailableInTx returns false)', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(false);
    vi.mocked(portfolioRepository.isSlugAvailableInTx).mockResolvedValue(false);
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'taken-slug' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This portfolio slug is already taken' });
  });

  it('throws 409 when unique constraint race occurs (upsertInTx throws 23505)', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.isReservedSlug).mockReturnValue(false);
    vi.mocked(portfolioRepository.isSlugAvailableInTx).mockResolvedValue(true);

    // Simulate the DB unique constraint violation on the patch upsert
    const dbError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'designer_portfolio_portfolio_slug_unique',
    });
    vi.mocked(portfolioRepository.upsertInTx).mockRejectedValueOnce(dbError);

    await expect(
      portfolioService.updatePortfolio({ portfolioSlug: 'race-slug' }, caller),
    ).rejects.toMatchObject({ status: 409, message: 'This portfolio slug is already taken' });
  });

  it('throws 422 when testimonial project not found', async () => {
    setupResolveProfile();
    setupGetPortfolio();
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());
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
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(makePortfolio());
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

  it('successful update returns portfolio response assembled from the upserted row', async () => {
    setupResolveProfile();
    setupGetPortfolio(makePortfolio({ portfolioSlug: 'my-studio' }));
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(
      makePortfolio({ tagline: 'New tagline', portfolioSlug: 'my-studio' }),
    );

    const result = await portfolioService.updatePortfolio({ tagline: 'New tagline' }, caller);

    expect(result).toMatchObject({
      id: 'portfolio-1',
      tagline: 'New tagline',
      // The public page is live, so the designer gets a real link to share.
      portfolioUrl: 'http://localhost:3000/d/my-studio',
    });
    // The response comes from data in hand — no post-commit re-fetch
    expect(portfolioRepository.findOrCreate).not.toHaveBeenCalled();
  });

  it('falls back to the org slug in portfolioUrl before a custom slug is chosen', async () => {
    setupResolveProfile();
    setupGetPortfolio(makePortfolio({ portfolioSlug: null }));
    vi.mocked(portfolioRepository.upsertInTx).mockResolvedValue(
      makePortfolio({ tagline: 'New tagline', portfolioSlug: null }),
    );

    const result = await portfolioService.updatePortfolio({ tagline: 'New tagline' }, caller);

    expect(result.portfolioUrl).toBe('http://localhost:3000/d/anika-spaces-a1b2c3');
  });

  it('does not upsert the portfolio row when only profile fields change', async () => {
    setupResolveProfile();
    setupGetPortfolio();

    const result = await portfolioService.updatePortfolio({ bio: 'New bio' }, caller);

    // Ensure-exists is non-mutating; the portfolio upsert must be skipped
    expect(portfolioRepository.upsertInTx).not.toHaveBeenCalled();
    expect(portfolioRepository.updateProfileInTx).toHaveBeenCalledWith(
      expect.anything(),
      'profile-1',
      { bio: 'New bio' },
    );
    // Response reflects the in-memory profile update without a re-fetch
    expect(result.bio).toBe('New bio');
  });

  it('reflects updated profile fields in the response', async () => {
    setupResolveProfile();
    setupGetPortfolio();

    const result = await portfolioService.updatePortfolio(
      { displayName: 'Renamed Studio', websiteUrl: 'https://renamed.example.com' },
      caller,
    );

    expect(result.displayName).toBe('Renamed Studio');
    expect(result.websiteUrl).toBe('https://renamed.example.com');
  });
});

// =============================================================================
// getPortfolio — badges + logo resolution
// =============================================================================

describe('portfolioService.getPortfolio badges', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Baseline profile that earns no threshold badges (only "verified"). */
  const baseline = () =>
    makeProfile({
      status: 'active',
      createdAt: new Date(Date.now() - 400 * DAY_MS),
      avgRating: '0',
      reviewCount: 0,
      yearsExperience: 0,
      projectCount: 0,
    });

  async function badgesFor(profile: DesignerProfileRecord) {
    setupResolveProfile(profile);
    setupGetPortfolio();
    const result = await portfolioService.getPortfolio(caller);
    return result.badges;
  }

  it('includes "verified" only for active profiles', async () => {
    expect(await badgesFor(baseline())).toEqual(['verified']);
    expect(await badgesFor({ ...baseline(), status: 'draft' })).toEqual([]);
  });

  it('includes "new" below the 90-day boundary but not at it', async () => {
    expect(
      await badgesFor({ ...baseline(), createdAt: new Date(Date.now() - 89 * DAY_MS) }),
    ).toContain('new');
    expect(
      await badgesFor({ ...baseline(), createdAt: new Date(Date.now() - 90 * DAY_MS) }),
    ).not.toContain('new');
  });

  it('includes "top-performer" at exactly 4.5 rating and 10 reviews', async () => {
    expect(
      await badgesFor({ ...baseline(), avgRating: '4.5', reviewCount: 10 }),
    ).toContain('top-performer');
  });

  it('coerces the avgRating string when computing "top-performer"', async () => {
    // avgRating comes back from Postgres numeric as a string
    expect(
      await badgesFor({ ...baseline(), avgRating: '4.49', reviewCount: 10 }),
    ).not.toContain('top-performer');
    expect(
      await badgesFor({ ...baseline(), avgRating: '4.90', reviewCount: 9 }),
    ).not.toContain('top-performer');
  });

  it('includes "established" at exactly 5 years but not at 4', async () => {
    expect(await badgesFor({ ...baseline(), yearsExperience: 5 })).toContain('established');
    expect(await badgesFor({ ...baseline(), yearsExperience: 4 })).not.toContain(
      'established',
    );
  });

  it('includes "projects-published" at exactly 25 projects but not at 24', async () => {
    expect(await badgesFor({ ...baseline(), projectCount: 25 })).toContain(
      'projects-published',
    );
    expect(await badgesFor({ ...baseline(), projectCount: 24 })).not.toContain(
      'projects-published',
    );
  });
});

describe('portfolioService.getPortfolio logo resolution', () => {
  it('returns logoUrl: null when the stored key does not match the profile prefix', async () => {
    setupResolveProfile(
      makeProfile({ logoImageId: 'originals/logos/other-profile/stolen-key' }),
    );
    setupGetPortfolio();

    const result = await portfolioService.getPortfolio(caller);

    expect(result.logoUrl).toBeNull();
    expect(presignDownload).not.toHaveBeenCalled();
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
    vi.mocked(portfolioRepository.setLogoIfMatch).mockResolvedValue(true);
    vi.mocked(presignDownload).mockResolvedValue('https://r2.example.com/presigned-get');

    const result = await portfolioService.commitLogoUpload(
      { objectKey: 'originals/logos/profile-1/uuid' },
      caller,
    );

    expect(result.logoUrl).toBe('https://r2.example.com/presigned-get');
    expect(portfolioRepository.setLogoIfMatch).toHaveBeenCalledWith(
      'profile-1',
      'originals/logos/profile-1/abc',
      'originals/logos/profile-1/uuid',
    );
  });

  it('throws 403 when object key does not belong to profile', async () => {
    setupResolveProfile();

    await expect(
      portfolioService.commitLogoUpload(
        { objectKey: 'originals/logos/other-profile/uuid' },
        caller,
      ),
    ).rejects.toMatchObject({ status: 403 });
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

  it('deletes previous logo when replacing', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/old-key' }));
    vi.mocked(objectExists).mockResolvedValue(true);
    vi.mocked(portfolioRepository.setLogoIfMatch).mockResolvedValue(true);
    vi.mocked(presignDownload).mockResolvedValue('https://r2.example.com/presigned-get');
    vi.mocked(deleteObject).mockResolvedValue(undefined);

    await portfolioService.commitLogoUpload(
      { objectKey: 'originals/logos/profile-1/new-key' },
      caller,
    );

    expect(deleteObject).toHaveBeenCalledWith('originals/logos/profile-1/old-key');
  });

  it('retries CAS once on concurrent modification and succeeds', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/old-key' }));
    vi.mocked(objectExists).mockResolvedValue(true);
    // First CAS fails (concurrent modification), second succeeds
    vi.mocked(portfolioRepository.setLogoIfMatch)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.mocked(presignDownload).mockResolvedValue('https://r2.example.com/presigned-get');

    const result = await portfolioService.commitLogoUpload(
      { objectKey: 'originals/logos/profile-1/new-key' },
      caller,
    );

    expect(result.logoUrl).toBe('https://r2.example.com/presigned-get');
    expect(portfolioRepository.setLogoIfMatch).toHaveBeenCalledTimes(2);
  });

  it('throws 409 when CAS retry also fails (double concurrent modification)', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/old-key' }));
    vi.mocked(objectExists).mockResolvedValue(true);
    // Both CAS attempts fail
    vi.mocked(portfolioRepository.setLogoIfMatch).mockResolvedValue(false);

    await expect(
      portfolioService.commitLogoUpload(
        { objectKey: 'originals/logos/profile-1/new-key' },
        caller,
      ),
    ).rejects.toMatchObject({ status: 409, message: 'Logo was modified concurrently, please retry' });
  });
});

// =============================================================================
// deleteLogo
// =============================================================================

describe('portfolioService.deleteLogo', () => {
  it('clears DB via compare-and-set, then best-effort storage cleanup', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/key' }));
    vi.mocked(portfolioRepository.clearLogoIfMatch).mockResolvedValue(true);
    vi.mocked(deleteObject).mockResolvedValue(undefined);

    await portfolioService.deleteLogo(caller);

    expect(portfolioRepository.clearLogoIfMatch).toHaveBeenCalledWith(
      'profile-1',
      'originals/logos/profile-1/key',
    );
    expect(deleteObject).toHaveBeenCalledWith('originals/logos/profile-1/key');
  });

  it('throws 404 when no logo exists', async () => {
    setupResolveProfile(makeProfile({ logoImageId: null }));

    await expect(portfolioService.deleteLogo(caller)).rejects.toMatchObject({
      status: 404,
      message: 'No logo exists to delete',
    });
  });

  it('still succeeds when storage cleanup fails (orphan left)', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/key' }));
    vi.mocked(portfolioRepository.clearLogoIfMatch).mockResolvedValue(true);
    vi.mocked(deleteObject).mockRejectedValue(new Error('S3 network error'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should NOT throw — storage failure is best-effort
    await portfolioService.deleteLogo(caller);

    // DB must still be cleared via CAS
    expect(portfolioRepository.clearLogoIfMatch).toHaveBeenCalledWith(
      'profile-1',
      'originals/logos/profile-1/key',
    );
  });

  it('does not delete storage when compare-and-set fails (concurrent modification)', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/profile-1/key' }));
    vi.mocked(portfolioRepository.clearLogoIfMatch).mockResolvedValue(false);

    await portfolioService.deleteLogo(caller);

    // Storage should NOT be touched since CAS indicated another request already modified
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('throws 403 when logo key does not match expected prefix', async () => {
    setupResolveProfile(makeProfile({ logoImageId: 'originals/logos/other-profile/key' }));

    await expect(portfolioService.deleteLogo(caller)).rejects.toMatchObject({
      status: 403,
    });
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

    // Should not throw despite audit failure
    const result = await portfolioService.updatePortfolio({ tagline: 'Test' }, caller);
    expect(result).toBeDefined();
    expect(result.id).toBe('portfolio-1');

    consoleSpy.mockRestore();
  });

  it('does not emit an audit event for an empty patch', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    setupResolveProfile();
    setupGetPortfolio();

    const result = await portfolioService.updatePortfolio({}, caller);

    expect(result.id).toBe('portfolio-1');
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(portfolioRepository.upsertInTx).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
