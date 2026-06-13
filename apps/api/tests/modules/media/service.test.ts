import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/modules/media/repository.js', () => ({
  mediaRepository: {
    findProjectOwner: vi.fn(),
    createProcessing: vi.fn(),
  },
}));
vi.mock('@repo/storage', () => ({
  buildOriginalKey: vi.fn(() => 'originals/p/uuid'),
  presignUpload: vi.fn(async () => 'https://r2.example/originals/p/uuid?X-Amz-Signature=abc'),
}));

import { mediaService } from '../../../src/modules/media/service.js';
import { mediaRepository } from '../../../src/modules/media/repository.js';
import { buildOriginalKey, presignUpload } from '@repo/storage';
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
