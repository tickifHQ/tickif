import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_STATUS, PLATFORM_ROLE } from '@repo/contracts';
import type { VisitorProfileRecord } from '../../../src/modules/visitors/repository.js';
import {
  VisitorProfileAccessDeniedError,
  VisitorProfileConstraintError,
} from '../../../src/modules/visitors/errors.js';

vi.mock('../../../src/modules/visitors/repository.js', () => ({
  visitorsRepository: {
    findByUserId: vi.fn(),
    upsertCompleted: vi.fn(),
  },
}));
vi.mock('../../../src/modules/taxonomy/service.js', () => ({
  taxonomyService: { list: vi.fn() },
}));

const { visitorsService } = await import('../../../src/modules/visitors/service.js');
const { visitorsRepository } = await import('../../../src/modules/visitors/repository.js');
const { taxonomyService } = await import('../../../src/modules/taxonomy/service.js');

const pendingVisitor = {
  userId: 'visitor_1',
  role: PLATFORM_ROLE.VISITOR,
  status: ACCOUNT_STATUS.PENDING,
  isBanned: false,
};

const profile: VisitorProfileRecord = {
  userId: pendingVisitor.userId,
  address: 'Bandra West, Mumbai',
  whatsappNumber: '+919800000001',
  feedPreferences: null,
  onboardingCompletedAt: new Date('2026-08-09T10:00:00.000Z'),
  createdAt: new Date('2026-08-09T10:00:00.000Z'),
  updatedAt: new Date('2026-08-09T10:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('visitorsService.getMine', () => {
  it('returns the authenticated visitor profile with ISO timestamps', async () => {
    vi.mocked(visitorsRepository.findByUserId).mockResolvedValue(profile);

    await expect(visitorsService.getMine(pendingVisitor)).resolves.toEqual({
      address: profile.address,
      whatsappNumber: profile.whatsappNumber,
      onboardingCompletedAt: '2026-08-09T10:00:00.000Z',
      createdAt: '2026-08-09T10:00:00.000Z',
      updatedAt: '2026-08-09T10:00:00.000Z',
    });
    expect(visitorsRepository.findByUserId).toHaveBeenCalledWith(pendingVisitor.userId);
  });

  it('returns a typed not-found error before onboarding is completed', async () => {
    vi.mocked(visitorsRepository.findByUserId).mockResolvedValue(null);

    await expect(visitorsService.getMine(pendingVisitor)).rejects.toMatchObject({ status: 404 });
  });
});

describe('visitorsService.upsertMine', () => {
  it('atomically completes onboarding and returns the persisted profile', async () => {
    vi.mocked(visitorsRepository.upsertCompleted).mockResolvedValue(profile);

    const input = {
      address: 'Bandra West, Mumbai',
      whatsappNumber: '+919800000001',
    };
    await expect(visitorsService.upsertMine(input, pendingVisitor)).resolves.toMatchObject(input);
    expect(visitorsRepository.upsertCompleted).toHaveBeenCalledWith(pendingVisitor.userId, input);
  });

  it('allows an active visitor to update the existing profile', async () => {
    vi.mocked(visitorsRepository.upsertCompleted).mockResolvedValue({
      ...profile,
      address: null,
      updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    });

    await expect(
      visitorsService.upsertMine(
        { address: null, whatsappNumber: profile.whatsappNumber },
        { ...pendingVisitor, status: ACCOUNT_STATUS.ACTIVE },
      ),
    ).resolves.toMatchObject({ address: null });
  });

  it('maps fresh database eligibility and constraint failures to safe API errors', async () => {
    vi.mocked(visitorsRepository.upsertCompleted)
      .mockRejectedValueOnce(new VisitorProfileAccessDeniedError())
      .mockRejectedValueOnce(new VisitorProfileConstraintError());
    const input = { address: null, whatsappNumber: null };

    await expect(visitorsService.upsertMine(input, pendingVisitor)).rejects.toMatchObject({
      status: 403,
      message: 'Visitor profile access is not permitted',
    });
    await expect(visitorsService.upsertMine(input, pendingVisitor)).rejects.toMatchObject({
      status: 422,
      message: 'Invalid visitor onboarding profile',
    });
  });
});

describe('visitor profile authorization', () => {
  it('rejects a designer before accessing visitor persistence', async () => {
    const designer = { ...pendingVisitor, role: PLATFORM_ROLE.DESIGNER };

    await expect(visitorsService.getMine(designer)).rejects.toMatchObject({ status: 403 });
    await expect(
      visitorsService.upsertMine({ address: null, whatsappNumber: null }, designer),
    ).rejects.toMatchObject({ status: 403 });
    expect(visitorsRepository.findByUserId).not.toHaveBeenCalled();
    expect(visitorsRepository.upsertCompleted).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', { ...pendingVisitor, role: PLATFORM_ROLE.ADMIN }],
    ['superadmin', { ...pendingVisitor, role: PLATFORM_ROLE.SUPERADMIN }],
    ['suspended account', { ...pendingVisitor, status: ACCOUNT_STATUS.SUSPENDED }],
    ['deleted account', { ...pendingVisitor, status: ACCOUNT_STATUS.DELETED }],
    ['banned account', { ...pendingVisitor, isBanned: true }],
  ])('rejects a %s before accessing persistence', async (_label, caller) => {
    await expect(visitorsService.getMine(caller)).rejects.toMatchObject({ status: 403 });
    await expect(
      visitorsService.upsertMine({ address: null, whatsappNumber: null }, caller),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('visitor feed preferences', () => {
  it('returns empty filters before preferences have been saved', async () => {
    vi.mocked(visitorsRepository.findByUserId).mockResolvedValue(null);
    await expect(visitorsService.getFeedPreferences(pendingVisitor)).resolves.toEqual({
      preferences: null,
      filters: {},
    });
  });

  it.each([
    ['1-bhk', { bhkSlug: '1-bhk' }],
    ['2-bhk', { bhkSlug: '2-bhk' }],
    ['3-bhk', { bhkSlug: '3-bhk' }],
    ['4-plus-bhk', { bhkSlug: ['4-bhk', '4-plus-bhk'] }],
    ['villa', { propertyTypeSlug: 'residential', propertySubtypeSlug: 'villa' }],
    [null, {}],
  ] as const)('maps %s to canonical feed filters', async (homeType, filters) => {
    const preferences = { homeType, citySlug: null, localitySlug: null };
    vi.mocked(visitorsRepository.upsertCompleted).mockResolvedValue({
      ...profile,
      feedPreferences: preferences,
    });
    await expect(visitorsService.saveFeedPreferences(preferences, pendingVisitor)).resolves.toEqual(
      {
        preferences,
        filters,
      },
    );
    expect(visitorsRepository.upsertCompleted).toHaveBeenCalledWith(pendingVisitor.userId, {
      feedPreferences: preferences,
    });
    expect(taxonomyService.list).not.toHaveBeenCalled();
  });

  it('validates the active city and its localities, then returns their filters', async () => {
    const preferences = { homeType: '3-bhk' as const, citySlug: 'chennai', localitySlug: 'adyar' };
    vi.mocked(taxonomyService.list)
      .mockResolvedValueOnce({
        terms: [{ id: 'city-id', slug: 'chennai', label: 'Chennai', parentId: null }],
      })
      .mockResolvedValueOnce({
        terms: [{ id: 'locality-id', slug: 'adyar', label: 'Adyar', parentId: 'city-id' }],
      });
    vi.mocked(visitorsRepository.upsertCompleted).mockResolvedValue({
      ...profile,
      feedPreferences: preferences,
    });
    await expect(visitorsService.saveFeedPreferences(preferences, pendingVisitor)).resolves.toEqual(
      {
        preferences,
        filters: { bhkSlug: '3-bhk', citySlug: 'chennai', localitySlug: 'adyar' },
      },
    );
    expect(taxonomyService.list).toHaveBeenCalledWith('locality', 'city-id');
  });

  it('rejects an unknown city before writing', async () => {
    vi.mocked(taxonomyService.list).mockResolvedValue({ terms: [] });
    await expect(
      visitorsService.saveFeedPreferences(
        {
          homeType: null,
          citySlug: 'missing',
          localitySlug: null,
        },
        pendingVisitor,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(visitorsRepository.upsertCompleted).not.toHaveBeenCalled();
  });

  it('rejects ineligible callers before reading location data or preferences', async () => {
    const caller = { ...pendingVisitor, isBanned: true };
    await expect(visitorsService.getFeedPreferences(caller)).rejects.toMatchObject({ status: 403 });
    await expect(
      visitorsService.saveFeedPreferences(
        {
          homeType: null,
          citySlug: 'chennai',
          localitySlug: null,
        },
        caller,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(taxonomyService.list).not.toHaveBeenCalled();
    expect(visitorsRepository.findByUserId).not.toHaveBeenCalled();
    expect(visitorsRepository.upsertCompleted).not.toHaveBeenCalled();
  });
});
