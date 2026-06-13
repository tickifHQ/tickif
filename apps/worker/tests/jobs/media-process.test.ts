import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Job } from 'bullmq';
import sharp from 'sharp';

vi.mock('@repo/storage', () => ({
  getObject: vi.fn(),
  putObject: vi.fn(async () => {}),
  buildDerivativeKey: (p: string, i: string, v: string, f: string) =>
    `derivatives/${p}/${i}/${v}.${f}`,
}));
vi.mock('../../src/media/repository.js', () => ({
  getImageForProcessing: vi.fn(),
  markReady: vi.fn(async () => {}),
  markFailed: vi.fn(async () => {}),
  findProjectPhashes: vi.fn(async () => []),
}));

import { processMedia } from '../../src/jobs/media-process.js';
import { getObject, putObject } from '@repo/storage';
import * as repo from '../../src/media/repository.js';
import { computePhash } from '../../src/media/phash.js';

const getObjectMock = vi.mocked(getObject);
const putObjectMock = vi.mocked(putObject);
const repoMock = vi.mocked(repo);

const job = (imageId: string): Job<{ imageId: string; storageKey: string }> =>
  ({ id: 'j1', data: { imageId, storageKey: 'k' } }) as Job<{
    imageId: string;
    storageKey: string;
  }>;

const processing = {
  id: 'img-1',
  projectId: 'proj-1',
  originalKey: 'originals/proj-1/abc',
  contentType: 'image/jpeg',
  status: 'processing' as const,
};

let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: 'blue' } })
    .jpeg()
    .toBuffer();
});

beforeEach(() => vi.clearAllMocks());

describe('processMedia', () => {
  it('skips when the image row is gone', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(null);
    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'missing' });
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('is idempotent — skips an already-ready image', async () => {
    repoMock.getImageForProcessing.mockResolvedValue({ ...processing, status: 'ready' });
    expect(await processMedia(job('img-1'))).toEqual({ ok: true, skipped: 'already-ready' });
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it('processes, stores derivatives, and flips status to ready', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.findProjectPhashes.mockResolvedValue([]);

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: true, derivatives: 8 });
    expect(putObjectMock).toHaveBeenCalledTimes(8);
    expect(repoMock.markReady).toHaveBeenCalledTimes(1);
    const [, data] = repoMock.markReady.mock.calls[0]!;
    expect(data.width).toBe(800);
    expect(data.height).toBe(600);
    expect(data.derivatives).toHaveLength(8);
    expect(data.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(repoMock.markFailed).not.toHaveBeenCalled();
  });

  it('fails the image when the bytes are not a valid image', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(Buffer.from('definitely not an image'));

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: false, reason: 'corrupt' });
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
    expect(repoMock.markReady).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('fails the image when a near-duplicate exists in the project', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockResolvedValue(jpeg);
    repoMock.findProjectPhashes.mockResolvedValue([
      { imageId: 'other', phash: await computePhash(jpeg) },
    ]);

    const result = await processMedia(job('img-1'));

    expect(result).toEqual({ ok: false, reason: 'duplicate' });
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
    expect(repoMock.markReady).not.toHaveBeenCalled();
  });

  it('marks failed and rethrows on an unexpected (transient) error', async () => {
    repoMock.getImageForProcessing.mockResolvedValue(processing);
    getObjectMock.mockRejectedValue(new Error('R2 timeout'));

    await expect(processMedia(job('img-1'))).rejects.toThrow('R2 timeout');
    expect(repoMock.markFailed).toHaveBeenCalledWith('img-1');
  });
});
