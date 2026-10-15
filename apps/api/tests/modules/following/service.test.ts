import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/modules/following/repository.js', () => ({
  followingRepository: {
    eligibility: vi.fn(),
    state: vi.fn(),
    follow: vi.fn(),
    remove: vi.fn(),
    seen: vi.fn(),
    list: vi.fn(),
  },
}));
vi.mock('@repo/storage', () => ({ presignDownload: vi.fn() }));
import { followingService } from '../../../src/modules/following/service.js';
import { followingRepository } from '../../../src/modules/following/repository.js';
import { presignDownload } from '@repo/storage';
const id = '11111111-1111-4111-8111-111111111111';
describe('following service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(followingRepository.eligibility).mockResolvedValue({ ownStudio: false });
  });
  it('rejects hidden or owned studios before inserting', async () => {
    vi.mocked(followingRepository.eligibility)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ownStudio: true });
    await expect(followingService.follow('visitor', id)).rejects.toMatchObject({ status: 404 });
    await expect(followingService.follow('visitor', id)).rejects.toMatchObject({ status: 403 });
    expect(followingRepository.follow).not.toHaveBeenCalled();
  });
  it('keeps idempotent follow and unfollow scoped to the actor', async () => {
    vi.mocked(followingRepository.follow).mockResolvedValue(true);
    expect(await followingService.follow('visitor', id)).toEqual({
      designerProfileId: id,
      following: true,
    });
    expect(await followingService.remove('visitor', id)).toEqual({
      designerProfileId: id,
      following: false,
    });
    expect(followingRepository.remove).toHaveBeenCalledWith('visitor', id);
  });
  it('rejects a visibility race instead of claiming follow succeeded', async () => {
    vi.mocked(followingRepository.follow).mockResolvedValue(false);
    await expect(followingService.follow('visitor', id)).rejects.toMatchObject({ status: 404 });
  });
  it('signs each distinct logo once and preserves initials fallback on storage failure', async () => {
    const row = {
      designerProfileId: id,
      displayName: 'Studio',
      slug: 'studio',
      logoImageId: 'logo.png',
      followedAt: new Date('2026-10-10T00:00:00Z'),
      newProjectCount: 2,
      profile: {
        displayName: 'Studio',
        status: 'active' as const,
        logoImageId: 'logo.png',
        bio: 'Studio biography',
      },
      portfolio: null,
    };
    vi.mocked(followingRepository.list).mockResolvedValue({
      items: [row, { ...row, designerProfileId: '22222222-2222-4222-8222-222222222222' }],
      total: 2,
    });
    vi.mocked(presignDownload).mockRejectedValue(new Error('Storage unavailable'));
    const result = await followingService.list('visitor', { page: 1, limit: 20 });
    expect(presignDownload).toHaveBeenCalledTimes(1);
    expect(result.items.every((item) => item.logoUrl === null)).toBe(true);
    expect(result.totalPages).toBe(1);
  });
});
