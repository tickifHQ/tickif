import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignerProfileRecord } from '../../../src/modules/profiles/repository.js';

// Mock the repository — no DB needed for unit tests.
vi.mock('../../../src/modules/profiles/repository.js', () => {
  return {
    profilesRepository: {
      findByOrgId: vi.fn(),
      hasGoogleAccount: vi.fn(),
      countFootprintByKind: vi.fn(),
      hasProject: vi.fn(),
      hasContact: vi.fn(),
    },
  };
});

vi.mock('../../../src/modules/orgs/repository.js', () => ({
  isOrgMember: vi.fn(),
  isOrgWriter: vi.fn(),
}));

// Import AFTER mock registration.
const { profilesService } = await import('../../../src/modules/profiles/service.js');
const { profilesRepository } = await import('../../../src/modules/profiles/repository.js');
const { isOrgMember } = await import('../../../src/modules/orgs/repository.js');

const profileRow = (over: Partial<DesignerProfileRecord> = {}): DesignerProfileRecord => ({
  id: '11111111-1111-4111-8111-111111111111',
  orgId: 'org-1',
  userId: 'user-1',
  entityType: 'individual',
  displayName: 'Test Studio',
  bio: 'We design beautiful spaces',
  logoImageId: 'logo-key-123',
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
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isOrgMember).mockResolvedValue(true);
});

describe('profilesService.getCompletion', () => {
  describe('steps', () => {
    it('returns all 4 steps', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(false);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(null);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps).toHaveLength(4);
      expect(result.steps.map((s) => s.key)).toEqual([
        'signed-in-with-google',
        'org-created',
        'profile-completed',
        'first-project-uploaded',
      ]);
    });

    it('marks signed-in-with-google as done when user has google account', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(null);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps.find((s) => s.key === 'signed-in-with-google')?.done).toBe(true);
    });

    it('marks org-created as done when orgId is provided', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(false);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(null);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps.find((s) => s.key === 'org-created')?.done).toBe(true);
    });

    it('requires an active organization instead of falling back to a membership', async () => {
      await expect(
        profilesService.getCompletion({ userId: 'u1', orgId: null }),
      ).rejects.toMatchObject({ status: 422 });
      expect(profilesRepository.findByOrgId).not.toHaveBeenCalled();
    });

    it('marks profile-completed when all required fields are filled', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profileRow());
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps.find((s) => s.key === 'profile-completed')?.done).toBe(true);
    });

    it('marks profile-completed as false when bio is missing', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profileRow({ bio: null }));
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps.find((s) => s.key === 'profile-completed')?.done).toBe(false);
    });

    it('marks first-project-uploaded when profile has a project', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profileRow());
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(true);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.steps.find((s) => s.key === 'first-project-uploaded')?.done).toBe(true);
    });
  });

  describe('score (based on profile fields, not steps)', () => {
    it('rejects an active organization that does not belong to the caller', async () => {
      vi.mocked(isOrgMember).mockResolvedValue(false);

      await expect(
        profilesService.getCompletion({ userId: 'u1', orgId: 'org-2' }),
      ).rejects.toMatchObject({ status: 403 });
      expect(profilesRepository.findByOrgId).not.toHaveBeenCalled();
    });

    it('returns 0 when org exists but no profile', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(null);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.score).toBe(0);
    });

    it('returns 100 when all 6 required fields are filled', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profileRow());
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(true);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.score).toBe(100);
    });

    it('returns partial score when some fields are missing', async () => {
      // Missing: bio, logo → 4/6 filled = 67%
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(
        profileRow({ bio: null, logoImageId: null }),
      );
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      // 4 of 6 fields = 67%
      expect(result.score).toBe(67);
    });

    it('includes missing field keys in the missing array', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(
        profileRow({ bio: null, logoImageId: null }),
      );
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(0); // no city, no scope
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(false);

      const result = await profilesService.getCompletion({ userId: 'u1', orgId: 'org-1' });

      expect(result.missing).toContain('bio');
      expect(result.missing).toContain('logo');
      expect(result.missing).toContain('location');
      expect(result.missing).toContain('scope');
      expect(result.missing).toContain('contact');
    });
  });

  describe('gating (isComplete)', () => {
    it('passes when score >= 60', async () => {
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(true);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(profileRow());
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(1);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(true);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(true);

      const gate = await profilesService.isComplete({ userId: 'u1', orgId: 'org-1' });

      expect(gate.pass).toBe(true);
      expect(gate.reason).toBeUndefined();
    });

    it('fails with reason when score < 60', async () => {
      // Only displayName filled → 1/6 = 17%
      vi.mocked(profilesRepository.hasGoogleAccount).mockResolvedValue(false);
      vi.mocked(profilesRepository.findByOrgId).mockResolvedValue(
        profileRow({ bio: null, logoImageId: null }),
      );
      vi.mocked(profilesRepository.countFootprintByKind).mockResolvedValue(0);
      vi.mocked(profilesRepository.hasContact).mockResolvedValue(false);
      vi.mocked(profilesRepository.hasProject).mockResolvedValue(false);

      const gate = await profilesService.isComplete({ userId: 'u1', orgId: 'org-1' });

      expect(gate.pass).toBe(false);
      expect(gate.reason).toContain('below the required 60%');
      expect(gate.reason).toContain('Missing:');
    });

    it('rejects publishing checks without an active organization', async () => {
      await expect(
        profilesService.isComplete({ userId: 'u1', orgId: null }),
      ).rejects.toMatchObject({ status: 422 });
    });
  });
});
