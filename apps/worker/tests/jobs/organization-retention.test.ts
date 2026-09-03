import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@repo/storage', () => ({
  deleteObject: vi.fn(async () => undefined),
}));

vi.mock('@repo/search', () => ({
  deleteSearchDocument: vi.fn(async () => true),
  deleteSearchProjectsByDesigner: vi.fn(async () => 0),
}));

vi.mock('../../src/organization-retention/repository.js', () => ({
  findOrganizationsDueForArchive: vi.fn(async () => []),
  archiveOrganization: vi.fn(async () => false),
  findOrganizationsDueForPurge: vi.fn(async () => []),
  prepareOrganizationPurge: vi.fn(async () => null),
  isStorageKeyReferencedOutsideOrganization: vi.fn(async () => false),
  markPurgeManifestItemDeleted: vi.fn(async () => undefined),
  markPurgeManifestItemFailed: vi.fn(async () => undefined),
  markOrganizationPurgeFailed: vi.fn(async () => undefined),
  finalizeOrganizationPurge: vi.fn(async () => false),
}));

const storage = await import('@repo/storage');
const search = await import('@repo/search');
const repository = await import('../../src/organization-retention/repository.js');
const { processOrganizationRetentionSweep } = await import(
  '../../src/jobs/organization-retention.js'
);

const now = new Date('2026-09-03T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('organization retention lifecycle processor', () => {
  it('archives every due candidate with the injected sweep clock', async () => {
    vi.mocked(repository.findOrganizationsDueForArchive).mockResolvedValue([
      { organizationId: 'org-1' },
      { organizationId: 'org-2' },
    ]);
    vi.mocked(repository.archiveOrganization)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await processOrganizationRetentionSweep(now);

    expect(result).toEqual({ archived: 1, purged: 0, failed: 0 });
    expect(repository.archiveOrganization).toHaveBeenNthCalledWith(1, 'org-1', now);
    expect(repository.archiveOrganization).toHaveBeenNthCalledWith(2, 'org-2', now);
  });

  it('deletes all captured external resources before finalizing the database purge', async () => {
    vi.mocked(repository.findOrganizationsDueForPurge).mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    vi.mocked(repository.prepareOrganizationPurge).mockResolvedValue({
      manifestId: 'manifest-1',
      organizationId: 'org-1',
      projectIds: ['project-1'],
      profileIds: ['profile-1'],
      items: [
        { sequence: 1n, resourceKey: 'originals/project-1/image-1' },
        { sequence: 2n, resourceKey: 'derivatives/project-1/image-1/thumb.webp' },
      ],
    });
    vi.mocked(repository.finalizeOrganizationPurge).mockResolvedValue(true);

    const result = await processOrganizationRetentionSweep(now);

    expect(result).toEqual({ archived: 0, purged: 1, failed: 0 });
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(repository.markPurgeManifestItemDeleted).toHaveBeenCalledTimes(2);
    expect(search.deleteSearchDocument).toHaveBeenCalledWith('projects', 'project-1');
    expect(search.deleteSearchDocument).toHaveBeenCalledWith('designers', 'profile-1');
    expect(search.deleteSearchProjectsByDesigner).toHaveBeenCalledWith('profile-1');
    expect(repository.finalizeOrganizationPurge).toHaveBeenCalledOnce();
    expect(
      vi.mocked(repository.finalizeOrganizationPurge).mock.invocationCallOrder[0],
    ).toBeGreaterThan(vi.mocked(search.deleteSearchProjectsByDesigner).mock.invocationCallOrder[0]!);
  });

  it('keeps the database intact and records retry state when storage deletion fails', async () => {
    vi.mocked(repository.findOrganizationsDueForPurge).mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    vi.mocked(repository.prepareOrganizationPurge).mockResolvedValue({
      manifestId: 'manifest-1',
      organizationId: 'org-1',
      projectIds: ['project-1'],
      profileIds: ['profile-1'],
      items: [{ sequence: 1n, resourceKey: 'originals/project-1/image-1' }],
    });
    vi.mocked(storage.deleteObject).mockRejectedValueOnce(new Error('R2 unavailable'));

    const result = await processOrganizationRetentionSweep(now);

    expect(result).toEqual({ archived: 0, purged: 0, failed: 1 });
    expect(repository.markPurgeManifestItemFailed).toHaveBeenCalledWith(1n, 'Error', now);
    expect(repository.markOrganizationPurgeFailed).toHaveBeenCalledWith(
      'manifest-1',
      'Error',
      now,
    );
    expect(search.deleteSearchDocument).not.toHaveBeenCalled();
    expect(repository.finalizeOrganizationPurge).not.toHaveBeenCalled();
  });

  it('preserves a media object that another organization still references', async () => {
    vi.mocked(repository.findOrganizationsDueForPurge).mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    vi.mocked(repository.prepareOrganizationPurge).mockResolvedValue({
      manifestId: 'manifest-1',
      organizationId: 'org-1',
      projectIds: [],
      profileIds: [],
      items: [{ sequence: 1n, resourceKey: 'originals/shared-image' }],
    });
    vi.mocked(repository.isStorageKeyReferencedOutsideOrganization).mockResolvedValue(true);
    vi.mocked(repository.finalizeOrganizationPurge).mockResolvedValue(true);

    const result = await processOrganizationRetentionSweep(now);

    expect(result.purged).toBe(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(repository.markPurgeManifestItemDeleted).toHaveBeenCalledWith(1n, now);
  });

  it('does not purge the database when Typesense cleanup fails', async () => {
    vi.mocked(repository.findOrganizationsDueForPurge).mockResolvedValue([
      { organizationId: 'org-1' },
    ]);
    vi.mocked(repository.prepareOrganizationPurge).mockResolvedValue({
      manifestId: 'manifest-1',
      organizationId: 'org-1',
      projectIds: ['project-1'],
      profileIds: [],
      items: [],
    });
    vi.mocked(search.deleteSearchDocument).mockRejectedValueOnce(
      new Error('Typesense unavailable'),
    );

    const result = await processOrganizationRetentionSweep(now);

    expect(result).toEqual({ archived: 0, purged: 0, failed: 1 });
    expect(repository.markOrganizationPurgeFailed).toHaveBeenCalledWith(
      'manifest-1',
      'Error',
      now,
    );
    expect(repository.finalizeOrganizationPurge).not.toHaveBeenCalled();
  });
});
