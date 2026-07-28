import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearchSource } from '../../src/search/mapper.js';

vi.mock('@repo/search', () => ({
  createSearchCollection: vi.fn(async () => undefined),
  deleteSearchCollection: vi.fn(async () => undefined),
  deleteSearchDocument: vi.fn(async () => false),
  deleteSearchProjectsByDesigner: vi.fn(async () => 0),
  getSearchCollectionTarget: vi.fn(async (kind: string) => `tickif_${kind}_v1`),
  importSearchDocuments: vi.fn(async () => undefined),
  swapSearchCollectionAlias: vi.fn(async () => undefined),
  upsertSearchDocument: vi.fn(async () => undefined),
  versionedSearchCollectionName: vi.fn(
    (kind: string, version: string) => `tickif_${kind}_v${version}`,
  ),
}));

vi.mock('../../src/search/repository.js', () => ({
  findDesignerSearchSource: vi.fn(),
  findProjectSearchSource: vi.fn(),
  listActiveDesignerIds: vi.fn(async () => []),
  listPublishedProjectIdsForDesigner: vi.fn(async () => []),
  listSearchableProjectIds: vi.fn(async () => []),
}));

vi.mock('../../src/search/outbox-repository.js', () => ({
  latestSearchProjectionSequence: vi.fn(async () => 10n),
  listSearchProjectionEventsBetween: vi.fn(),
  withSearchProjectionRebuildBarrier: vi.fn(async (work: () => Promise<unknown>) => work()),
}));

const search = await import('@repo/search');
const repository = await import('../../src/search/repository.js');
const outbox = await import('../../src/search/outbox-repository.js');
const { rebuildSearchCollections } = await import('../../src/search/rebuild.js');

const projectSource: ProjectSearchSource = {
  project: {
    id: 'project-1',
    slug: 'project-one',
    title: 'Project One',
    description: null,
    designerId: 'designer-1',
    citySlug: 'mumbai',
    localitySlug: null,
    propertyTypeSlug: null,
    propertySubtypeSlug: null,
    scopeSlug: null,
    bhkSlug: null,
    budgetBandSlug: null,
    sizeSqft: null,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  },
  designer: { slug: 'studio-one', displayName: 'Studio One' },
  cover: null,
  rooms: [],
  images: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(search.getSearchCollectionTarget).mockImplementation(
    async (kind) => `tickif_${kind}_v1`,
  );
  vi.mocked(repository.listSearchableProjectIds).mockResolvedValue([]);
  vi.mocked(repository.listActiveDesignerIds).mockResolvedValue([]);
  vi.mocked(outbox.latestSearchProjectionSequence)
    .mockResolvedValueOnce(10n)
    .mockResolvedValueOnce(11n)
    .mockResolvedValue(11n);
  vi.mocked(outbox.listSearchProjectionEventsBetween).mockResolvedValue([
    {
      sequence: 11n,
      entityKind: 'project',
      entityId: 'project-1',
      operation: 'index',
      sourceUpdatedAt: new Date(),
    },
  ]);
  vi.mocked(repository.findProjectSearchSource).mockResolvedValue(projectSource);
});

describe('full search rebuild', () => {
  it('replays mutations behind the rebuild barrier before swapping aliases', async () => {
    await expect(rebuildSearchCollections(1000, 0)).resolves.toMatchObject({
      projects: 0,
      designers: 0,
      replayed: 1,
      collections: {
        projects: 'tickif_projects_v1000-0',
        designers: 'tickif_designers_v1000-0',
      },
    });

    expect(search.upsertSearchDocument).toHaveBeenCalledWith(
      'projects',
      expect.objectContaining({ id: 'project-1' }),
      { collectionName: 'tickif_projects_v1000-0' },
    );
    expect(search.swapSearchCollectionAlias).toHaveBeenNthCalledWith(
      1,
      'projects',
      'tickif_projects_v1000-0',
    );
    expect(search.swapSearchCollectionAlias).toHaveBeenNthCalledWith(
      2,
      'designers',
      'tickif_designers_v1000-0',
    );
    expect(vi.mocked(search.upsertSearchDocument).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(search.swapSearchCollectionAlias).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(outbox.withSearchProjectionRebuildBarrier).mock.invocationCallOrder[1],
    ).toBeLessThan(
      vi.mocked(outbox.listSearchProjectionEventsBetween).mock.invocationCallOrder[0]!,
    );
    expect(
      vi.mocked(outbox.listSearchProjectionEventsBetween).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(outbox.withSearchProjectionRebuildBarrier).mock.invocationCallOrder[2]!,
    );
  });

  it('rolls the project alias back when the designer alias swap fails', async () => {
    vi.mocked(outbox.listSearchProjectionEventsBetween).mockReset();
    vi.mocked(outbox.listSearchProjectionEventsBetween).mockResolvedValue([]);
    vi.mocked(outbox.latestSearchProjectionSequence).mockReset();
    vi.mocked(outbox.latestSearchProjectionSequence).mockResolvedValue(10n);
    vi.mocked(search.swapSearchCollectionAlias)
      .mockResolvedValueOnce({
        aliasName: 'tickif_projects',
        previousCollectionName: 'tickif_projects_v1',
        collectionName: 'tickif_projects_v1000-0',
      })
      .mockRejectedValueOnce(new Error('alias failure'))
      .mockResolvedValueOnce({
        aliasName: 'tickif_projects',
        previousCollectionName: 'tickif_projects_v1000-0',
        collectionName: 'tickif_projects_v1',
      });

    await expect(rebuildSearchCollections(1000, 0)).rejects.toThrow('alias failure');

    expect(search.swapSearchCollectionAlias).toHaveBeenNthCalledWith(
      3,
      'projects',
      'tickif_projects_v1',
    );
    expect(search.deleteSearchCollection).toHaveBeenCalledWith(
      'projects',
      'tickif_projects_v1000-0',
    );
  });
});
