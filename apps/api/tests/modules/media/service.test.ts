import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/modules/media/repository.js', () => ({
  mediaRepository: {
    findProjectOwner: vi.fn(),
    createProcessing: vi.fn(),
    findImageWithOwner: vi.fn(),
    listByProject: vi.fn(),
  },
}));
vi.mock('@repo/storage', () => ({
  buildOriginalKey: vi.fn(() => 'originals/p/uuid'),
  presignUpload: vi.fn(async () => 'https://r2.example/originals/p/uuid?X-Amz-Signature=abc'),
}));
vi.mock('@repo/queue', () => ({ enqueueMedia: vi.fn(async () => {}) }));

import { mediaService } from '../../../src/modules/media/service.js';
import { mediaRepository } from '../../../src/modules/media/repository.js';
import { buildOriginalKey, presignUpload } from '@repo/storage';
import { enqueueMedia } from '@repo/queue';
import { AppError } from '../../../src/lib/errors.js';

const repo = vi.mocked(mediaRepository);

describe('mediaService.createUploadUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    projectId: '11111111-1111-1111-1111-111111111111',
    contentType: 'image/jpeg' as const,
    userId: 'user-1',
  };

  it('422s when the declared size exceeds the cap, before any DB lookup', async () => {
    await expect(
      mediaService.createUploadUrl({ ...input, size: 10 ** 12 }),
    ).rejects.toMatchObject({ status: 422, code: 'file_too_large' });
    expect(repo.findProjectOwner).not.toHaveBeenCalled();
  });

  it('404s when the project does not exist', async () => {
    repo.findProjectOwner.mockResolvedValue(null);
    await expect(mediaService.createUploadUrl(input)).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.createProcessing).not.toHaveBeenCalled();
  });

  it('403s when the caller does not own the project', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: 'someone-else' });
    await expect(mediaService.createUploadUrl(input)).rejects.toBeInstanceOf(AppError);
    await expect(mediaService.createUploadUrl(input)).rejects.toMatchObject({ status: 403 });
    expect(presignUpload).not.toHaveBeenCalled();
  });

  it('creates a processing row and returns a presigned url for the owner', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: 'user-1' });
    repo.createProcessing.mockResolvedValue({ id: 'img-1', originalKey: 'originals/p/uuid' } as never);

    const result = await mediaService.createUploadUrl(input);

    expect(buildOriginalKey).toHaveBeenCalledWith(input.projectId);
    expect(repo.createProcessing).toHaveBeenCalledWith({
      projectId: input.projectId,
      originalKey: 'originals/p/uuid',
      contentType: 'image/jpeg',
    });
    expect(presignUpload).toHaveBeenCalledWith({
      key: 'originals/p/uuid',
      contentType: 'image/jpeg',
    });
    expect(result).toEqual({
      imageId: 'img-1',
      key: 'originals/p/uuid',
      uploadUrl: 'https://r2.example/originals/p/uuid?X-Amz-Signature=abc',
    });
  });
});

describe('mediaService.commitUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404s when the image is missing', async () => {
    repo.findImageWithOwner.mockResolvedValue(null);
    await expect(
      mediaService.commitUpload({ imageId: 'img-1', userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('403s when the caller does not own the image', async () => {
    repo.findImageWithOwner.mockResolvedValue({
      id: 'img-1',
      projectId: 'p',
      originalKey: 'originals/p/abc',
      ownerUserId: 'someone-else',
    });
    await expect(
      mediaService.commitUpload({ imageId: 'img-1', userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('enqueues processing for the owner', async () => {
    repo.findImageWithOwner.mockResolvedValue({
      id: 'img-1',
      projectId: 'p',
      originalKey: 'originals/p/abc',
      ownerUserId: 'user-1',
    });
    const result = await mediaService.commitUpload({ imageId: 'img-1', userId: 'user-1' });
    expect(enqueueMedia).toHaveBeenCalledWith({ imageId: 'img-1', storageKey: 'originals/p/abc' });
    expect(result).toEqual({ imageId: 'img-1', status: 'processing' });
  });
});

describe('mediaService.listProjectImages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps rows to DTOs for the owner', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: 'user-1' });
    repo.listByProject.mockResolvedValue([
      {
        id: 'img-1',
        status: 'ready',
        sortOrder: 0,
        width: 1600,
        height: 1200,
        derivatives: [{ variant: 'thumb', format: 'webp', key: 'd/t.webp', width: 320, height: 240 }],
      },
    ] as never);

    const result = await mediaService.listProjectImages({ projectId: 'p', userId: 'user-1' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'img-1', status: 'ready', sortOrder: 0 });
    expect(result.items[0]!.derivatives).toHaveLength(1);
  });

  it('403s for a non-owner', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: 'other' });
    await expect(
      mediaService.listProjectImages({ projectId: 'p', userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
