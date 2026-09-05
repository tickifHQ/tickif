import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/modules/organization-retention/repository.js', () => ({
  organizationRetentionRepository: {
    findForOwner: vi.fn(),
    findByOrganization: vi.fn(),
    requestDeletion: vi.fn(),
    restore: vi.fn(),
    setLegalHold: vi.fn(),
    requestPermanentErasure: vi.fn(),
  },
}));

const { organizationRetentionService } =
  await import('../../../src/modules/organization-retention/service.js');
const { organizationRetentionRepository } =
  await import('../../../src/modules/organization-retention/repository.js');

const NOW = new Date('2026-09-03T12:00:00.000Z');
const retention = {
  organizationId: 'org-1',
  status: 'deletion_requested' as const,
  requestedByUserId: 'user-1',
  requestedAt: NOW,
  archiveDueAt: new Date('2026-12-02T12:00:00.000Z'),
  hardDeleteDueAt: new Date('2027-12-02T12:00:00.000Z'),
  delistWindowDays: 90,
  archiveWindowDays: 365,
  archivedAt: null,
  purgeRequestedAt: null,
  purgingAt: null,
  erasedAt: null,
  holdPlacedAt: null,
  holdPlacedByUserId: null,
  holdReason: null,
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('organizationRetentionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the owner-visible lifecycle without exposing actor identifiers', async () => {
    vi.mocked(organizationRetentionRepository.findForOwner).mockResolvedValue(retention);

    await expect(
      organizationRetentionService.getForOwner({ organizationId: 'org-1', userId: 'user-1' }),
    ).resolves.toEqual({
      retention: {
        organizationId: 'org-1',
        status: 'deletion_requested',
        requestedAt: '2026-09-03T12:00:00.000Z',
        archiveDueAt: '2026-12-02T12:00:00.000Z',
        hardDeleteDueAt: '2027-12-02T12:00:00.000Z',
        delistWindowDays: 90,
        archiveWindowDays: 365,
        archivedAt: null,
        purgeRequestedAt: null,
        purgingAt: null,
        erasedAt: null,
        holdPlacedAt: null,
        holdReason: null,
        revision: 1,
      },
    });
  });

  it('rejects a non-owner lifecycle read', async () => {
    vi.mocked(organizationRetentionRepository.findForOwner).mockResolvedValue('forbidden');

    await expect(
      organizationRetentionService.getForOwner({ organizationId: 'org-1', userId: 'user-2' }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('uses the injected clock for a deletion request', async () => {
    vi.mocked(organizationRetentionRepository.requestDeletion).mockResolvedValue({
      outcome: 'updated',
      retention,
    });

    await organizationRetentionService.requestDeletion({
      organizationId: 'org-1',
      userId: 'user-1',
      confirmationSlug: 'studio-one',
      now: NOW,
    });

    expect(organizationRetentionRepository.requestDeletion).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      confirmationSlug: 'studio-one',
      now: NOW,
    });
  });

  it('uses the superadmin recovery path for an archived organization', async () => {
    vi.mocked(organizationRetentionRepository.restore).mockResolvedValue({
      outcome: 'updated',
      retention: null,
    });

    await expect(
      organizationRetentionService.restoreArchived({
        organizationId: 'org-1',
        actorUserId: 'superadmin-1',
        now: NOW,
      }),
    ).resolves.toEqual({ retention: null });
    expect(organizationRetentionRepository.restore).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'superadmin-1',
      allowArchived: true,
      now: NOW,
    });
  });

  it('rejects permanent erasure while a legal hold is active', async () => {
    vi.mocked(organizationRetentionRepository.requestPermanentErasure).mockResolvedValue({
      outcome: 'legal_hold',
    });

    await expect(
      organizationRetentionService.requestPermanentErasure({
        organizationId: 'org-1',
        userId: 'user-1',
        confirmationSlug: 'studio-one',
        now: NOW,
      }),
    ).rejects.toMatchObject({ status: 409, code: 'conflict' });
  });
});
