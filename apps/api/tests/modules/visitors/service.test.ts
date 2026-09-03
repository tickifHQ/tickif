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

const { visitorsService } = await import('../../../src/modules/visitors/service.js');
const { visitorsRepository } = await import('../../../src/modules/visitors/repository.js');

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
  it('allows a designer to use the same personal profile', async () => {
    vi.mocked(visitorsRepository.findByUserId).mockResolvedValue(profile);
    vi.mocked(visitorsRepository.upsertCompleted).mockResolvedValue(profile);
    const designer = { ...pendingVisitor, role: PLATFORM_ROLE.DESIGNER };

    await expect(visitorsService.getMine(designer)).resolves.toBeDefined();
    await expect(
      visitorsService.upsertMine({ address: null, whatsappNumber: null }, designer),
    ).resolves.toBeDefined();
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
