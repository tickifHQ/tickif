import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/media/repository.js', () => ({
  listUncheckedDuplicateImages: vi.fn(),
  findPriorProjectPhashes: vi.fn(),
  markDuplicateChecked: vi.fn(),
}));

vi.mock('@repo/config', () => ({
  config: { MEDIA_DEDUP_HAMMING_THRESHOLD: 5 },
}));

const { backfillDuplicateFlags } = await import('../../src/media/duplicate-backfill.js');
const { listUncheckedDuplicateImages, findPriorProjectPhashes, markDuplicateChecked } =
  await import('../../src/media/repository.js');

const listUnchecked = vi.mocked(listUncheckedDuplicateImages);
const findPrior = vi.mocked(findPriorProjectPhashes);
const markChecked = vi.mocked(markDuplicateChecked);

beforeEach(() => vi.clearAllMocks());

describe('backfillDuplicateFlags', () => {
  it('persists directional duplicate provenance for a bounded batch', async () => {
    const first = {
      id: 'image-1',
      projectId: 'project-1',
      phash: '0000000000000000',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const second = {
      ...first,
      id: 'image-2',
      createdAt: new Date('2026-01-01T00:01:00.000Z'),
    };
    listUnchecked.mockResolvedValue([first, second]);
    findPrior
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ imageId: first.id, phash: first.phash }]);
    markChecked.mockResolvedValue(true);

    await expect(backfillDuplicateFlags(25)).resolves.toBe(2);
    expect(listUnchecked).toHaveBeenCalledWith(25);
    expect(markChecked).toHaveBeenNthCalledWith(1, first.id, null);
    expect(markChecked).toHaveBeenNthCalledWith(2, second.id, {
      imageId: first.id,
      distance: 0,
    });
  });
});
