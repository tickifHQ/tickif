import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignerSearchSource } from '../../src/search/mapper.js';

vi.mock('@repo/queue', () => ({ enqueueDesignerExperienceRefresh: vi.fn() }));
vi.mock('@repo/search', () => ({ deleteSearchDocument: vi.fn(), upsertSearchDocument: vi.fn() }));
vi.mock('../../src/search/repository.js', () => ({
  listActiveDesignerIds: vi.fn(),
  findDesignerSearchSource: vi.fn(),
}));
vi.mock('../../src/search/mapper.js', () => ({
  mapDesignerSearchDocument: vi.fn(() => ({ id: 'one' })),
}));
vi.mock('../../src/search/outbox-repository.js', () => ({
  withSearchProjectionEntityLock: vi.fn(
    async (_kind: string, _id: string, work: () => Promise<unknown>) => work(),
  ),
}));

const queue = await import('@repo/queue');
const repository = await import('../../src/search/repository.js');
const search = await import('@repo/search');
const { sweepDesignerExperience, refreshDesignerExperience } =
  await import('../../src/jobs/designer-experience-refresh.js');

const source: DesignerSearchSource = {
  profile: {
    id: 'one',
    slug: 'one',
    displayName: 'One',
    bio: null,
    tagline: null,
    entityType: 'company',
    yearsExperience: 0,
    foundedYear: 2020,
    projectCount: 0,
    avgRating: '0',
    planTier: null,
    subscriptionState: null,
    reviewCount: 0,
    logoImageId: null,
    heroImageId: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    isKycVerified: false,
    kycExpiresAt: null,
  },
  footprint: [],
};

describe('designer experience annual refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('catches up in the current UTC year and schedules a different year after rollover', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:59Z'));
    await sweepDesignerExperience();
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    await sweepDesignerExperience();
    expect(queue.enqueueDesignerExperienceRefresh).toHaveBeenNthCalledWith(1, 2026);
    expect(queue.enqueueDesignerExperienceRefresh).toHaveBeenNthCalledWith(2, 2027);
  });

  it('reads bounded pages and removes profiles that become private during refresh', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => `designer-${index}`);
    vi.mocked(repository.listActiveDesignerIds)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(['last']);
    vi.mocked(repository.findDesignerSearchSource).mockResolvedValue(null);
    await expect(refreshDesignerExperience()).resolves.toEqual({ refreshed: 101 });
    expect(repository.listActiveDesignerIds).toHaveBeenNthCalledWith(1, null, 100);
    expect(repository.listActiveDesignerIds).toHaveBeenNthCalledWith(2, 'designer-99', 100);
    expect(search.deleteSearchDocument).toHaveBeenLastCalledWith('designers', 'last');
  });

  it('fails the job on a write failure so BullMQ retries without a success marker', async () => {
    vi.mocked(repository.listActiveDesignerIds).mockResolvedValue(['one']);
    vi.mocked(repository.findDesignerSearchSource).mockResolvedValue(null);
    vi.mocked(search.deleteSearchDocument).mockRejectedValueOnce(new Error('search unavailable'));
    await expect(refreshDesignerExperience()).rejects.toThrow('search unavailable');
  });

  it('maps and writes the current source for an eligible studio without project fan-out', async () => {
    vi.mocked(repository.listActiveDesignerIds).mockResolvedValue(['one']);
    vi.mocked(repository.findDesignerSearchSource).mockResolvedValue(source);
    await expect(refreshDesignerExperience()).resolves.toEqual({ refreshed: 1 });
    expect(search.upsertSearchDocument).toHaveBeenCalledWith('designers', { id: 'one' });
    expect(search.deleteSearchDocument).not.toHaveBeenCalled();
  });
});
