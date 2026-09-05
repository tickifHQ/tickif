import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/modules/media/repository.js', () => ({
  mediaRepository: {
    findProjectOwner: vi.fn(),
    createProcessing: vi.fn(),
    cancelProcessingReservation: vi.fn(),
    findImageWithOwner: vi.fn(),
    listByProject: vi.fn(),
    roomBelongsToProject: vi.fn(),
    taxonomySlugsExist: vi.fn(),
    updateMetadata: vi.fn(),
  },
}));
vi.mock('@repo/storage', () => ({
  buildOriginalKey: vi.fn(() => 'originals/p/uuid'),
  presignUpload: vi.fn(async () => 'https://r2.example/originals/p/uuid?X-Amz-Signature=abc'),
  presignDownload: vi.fn(
    async ({ key }: { key: string }) => `https://r2.example/${key}?X-Amz-Signature=read`,
  ),
  objectExists: vi.fn(async () => true),
}));
vi.mock('@repo/queue', () => ({ enqueueMedia: vi.fn(async () => {}) }));

import { mediaService } from '../../../src/modules/media/service.js';
import { mediaRepository } from '../../../src/modules/media/repository.js';
import { buildOriginalKey, presignUpload, presignDownload, objectExists } from '@repo/storage';
import { enqueueMedia } from '@repo/queue';
import { AppError } from '../../../src/lib/errors.js';

const repo = vi.mocked(mediaRepository);
const objectExistsMock = vi.mocked(objectExists);

const OWNER = { userId: 'user-1', userRole: 'designer' };
const STRANGER = { userId: 'user-2', userRole: 'designer' };
const SUPERADMIN = { userId: 'admin-1', userRole: 'superadmin' };

describe('mediaService.createUploadUrl', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    projectId: '11111111-1111-1111-1111-111111111111',
    contentType: 'image/jpeg' as const,
    size: 1000,
    ...OWNER,
  };

  it('422s when the declared size exceeds the cap, before any DB lookup', async () => {
    await expect(mediaService.createUploadUrl({ ...input, size: 10 ** 12 })).rejects.toMatchObject({
      status: 422,
      code: 'file_too_large',
    });
    expect(repo.findProjectOwner).not.toHaveBeenCalled();
  });

  it('404s when the project does not exist', async () => {
    repo.findProjectOwner.mockResolvedValue(null);
    await expect(mediaService.createUploadUrl(input)).rejects.toMatchObject({ status: 404 });
    expect(repo.createProcessing).not.toHaveBeenCalled();
  });

  it('403s when the caller is neither owner nor superadmin', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    await expect(mediaService.createUploadUrl({ ...input, ...STRANGER })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(mediaService.createUploadUrl({ ...input, ...STRANGER })).rejects.toMatchObject({
      status: 403,
    });
    expect(presignUpload).not.toHaveBeenCalled();
  });

  it('creates a processing row and signs the declared size for the owner', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    repo.createProcessing.mockResolvedValue({
      id: 'img-1',
      originalKey: 'originals/p/uuid',
    } as never);

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
      contentLength: 1000,
    });
    expect(result).toEqual({
      imageId: 'img-1',
      key: 'originals/p/uuid',
      uploadUrl: 'https://r2.example/originals/p/uuid?X-Amz-Signature=abc',
    });
  });

  it('allows a superadmin (non-owner) — moderation access', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    repo.createProcessing.mockResolvedValue({
      id: 'img-1',
      originalKey: 'originals/p/uuid',
    } as never);
    await expect(mediaService.createUploadUrl({ ...input, ...SUPERADMIN })).resolves.toMatchObject({
      imageId: 'img-1',
    });
  });
});

describe('mediaService.commitUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  const processingImage = {
    id: 'img-1',
    projectId: 'p',
    originalKey: 'originals/p/abc',
    status: 'processing' as const,
    projectStatus: 'draft' as const,
    ownerUserId: OWNER.userId,
  };

  it('404s when the image is missing', async () => {
    repo.findImageWithOwner.mockResolvedValue(null);
    await expect(mediaService.commitUpload({ imageId: 'img-1', ...OWNER })).rejects.toMatchObject({
      status: 404,
    });
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('403s when the caller is neither owner nor superadmin', async () => {
    repo.findImageWithOwner.mockResolvedValue(processingImage);
    await expect(
      mediaService.commitUpload({ imageId: 'img-1', ...STRANGER }),
    ).rejects.toMatchObject({ status: 403 });
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('409s on replay when the image is no longer processing', async () => {
    repo.findImageWithOwner.mockResolvedValue({ ...processingImage, status: 'ready' });
    await expect(mediaService.commitUpload({ imageId: 'img-1', ...OWNER })).rejects.toMatchObject({
      status: 409,
    });
    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('409s when committing media after the project leaves draft', async () => {
    repo.findImageWithOwner.mockResolvedValue({ ...processingImage, projectStatus: 'submitted' });

    await expect(mediaService.commitUpload({ imageId: 'img-1', ...OWNER })).rejects.toMatchObject({
      status: 409,
    });
    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('allows committing media while changes are requested', async () => {
    repo.findImageWithOwner.mockResolvedValue({
      ...processingImage,
      projectStatus: 'changes_requested',
    });
    objectExistsMock.mockResolvedValueOnce(true);

    await expect(mediaService.commitUpload({ imageId: 'img-1', ...OWNER })).resolves.toEqual({
      imageId: 'img-1',
      status: 'processing',
    });
    expect(enqueueMedia).toHaveBeenCalledWith({ imageId: 'img-1' });
  });

  it('400s when the object was never uploaded', async () => {
    repo.findImageWithOwner.mockResolvedValue(processingImage);
    objectExistsMock.mockResolvedValueOnce(false);
    await expect(mediaService.commitUpload({ imageId: 'img-1', ...OWNER })).rejects.toMatchObject({
      status: 400,
    });
    expect(enqueueMedia).not.toHaveBeenCalled();
  });

  it('enqueues processing for the owner after confirming the upload', async () => {
    repo.findImageWithOwner.mockResolvedValue(processingImage);
    objectExistsMock.mockResolvedValueOnce(true);
    const result = await mediaService.commitUpload({ imageId: 'img-1', ...OWNER });
    expect(objectExistsMock).toHaveBeenCalledWith('originals/p/abc');
    expect(enqueueMedia).toHaveBeenCalledWith({ imageId: 'img-1' });
    expect(result).toEqual({ imageId: 'img-1', status: 'processing' });
  });
});

describe('mediaService.listProjectImages', () => {
  beforeEach(() => vi.clearAllMocks());

  const row = {
    id: 'img-1',
    roomId: null,
    status: 'ready',
    sortOrder: 0,
    themeSlugs: ['modern'],
    materialSlugs: ['wood'],
    finishSlugs: ['veneer'],
    tagSlugs: ['hero'],
    width: 1600,
    height: 1200,
    derivatives: [
      { variant: 'thumb', format: 'webp', key: 'd/t.webp', width: 320, height: 240 },
      { variant: 'large', format: 'webp', key: 'd/l.webp', width: 1600, height: 1200 },
    ],
  };

  it('maps rows to DTOs for the owner', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    repo.listByProject.mockResolvedValue([row] as never);

    const result = await mediaService.listProjectImages({
      projectId: 'p',
      limit: 50,
      offset: 0,
      ...OWNER,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'img-1', status: 'ready', sortOrder: 0 });
    expect(result.items[0]).toMatchObject({
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['veneer'],
    });
    expect(result.items[0]!.derivatives).toHaveLength(2);
    expect(result.items[0]!.previewUrl).toBe('https://r2.example/d/t.webp?X-Amz-Signature=read');
    expect(result.items[0]!.viewerUrl).toBe('https://r2.example/d/l.webp?X-Amz-Signature=read');
    expect(presignDownload).toHaveBeenCalledWith({ key: 'd/t.webp' });
    expect(presignDownload).toHaveBeenCalledWith({ key: 'd/l.webp' });
  });

  it('403s for a non-owner who is not superadmin', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    await expect(
      mediaService.listProjectImages({ projectId: 'p', limit: 50, offset: 0, ...STRANGER }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows a superadmin to list any project (moderation)', async () => {
    repo.findProjectOwner.mockResolvedValue({ ownerUserId: OWNER.userId, projectStatus: 'draft' });
    repo.listByProject.mockResolvedValue([row] as never);
    const result = await mediaService.listProjectImages({
      projectId: 'p',
      limit: 50,
      offset: 0,
      ...SUPERADMIN,
    });
    expect(result.items).toHaveLength(1);
  });
});

describe('mediaService.updateImageMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.taxonomySlugsExist.mockResolvedValue(true);
  });

  const image = {
    id: 'img-1',
    projectId: 'project-1',
    originalKey: 'originals/project-1/abc',
    status: 'ready' as const,
    projectStatus: 'draft' as const,
    ownerUserId: OWNER.userId,
  };

  it('409s when metadata is updated after the project leaves draft', async () => {
    repo.findImageWithOwner.mockResolvedValue({ ...image, projectStatus: 'published' });

    await expect(
      mediaService.updateImageMetadata({
        imageId: 'img-1',
        metadata: { tagSlugs: ['hero'] },
        ...OWNER,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('allows metadata edits while changes are requested', async () => {
    repo.findImageWithOwner.mockResolvedValue({ ...image, projectStatus: 'changes_requested' });
    repo.updateMetadata.mockResolvedValue({
      id: 'img-1',
      roomId: null,
      status: 'ready',
      sortOrder: 0,
      themeSlugs: [],
      materialSlugs: [],
      finishSlugs: [],
      tagSlugs: ['hero'],
      width: null,
      height: null,
      derivatives: [],
    } as never);

    const result = await mediaService.updateImageMetadata({
      imageId: 'img-1',
      metadata: { tagSlugs: ['hero'] },
      ...OWNER,
    });

    expect(result.tagSlugs).toEqual(['hero']);
  });

  it('allows metadata edits after a rejection so the project can be resubmitted', async () => {
    repo.findImageWithOwner.mockResolvedValue({ ...image, projectStatus: 'rejected' });
    repo.updateMetadata.mockResolvedValue({
      id: 'img-1',
      roomId: null,
      status: 'ready',
      sortOrder: 0,
      themeSlugs: [],
      materialSlugs: [],
      finishSlugs: [],
      tagSlugs: ['hero'],
      width: null,
      height: null,
      derivatives: [],
    } as never);

    const result = await mediaService.updateImageMetadata({
      imageId: 'img-1',
      metadata: { tagSlugs: ['hero'] },
      ...OWNER,
    });

    expect(result.tagSlugs).toEqual(['hero']);
  });

  it('rejects room ids from another project', async () => {
    repo.findImageWithOwner.mockResolvedValue(image);
    repo.roomBelongsToProject.mockResolvedValue(false);

    await expect(
      mediaService.updateImageMetadata({
        imageId: 'img-1',
        metadata: { roomId: '33333333-3333-4333-8333-333333333333' },
        ...OWNER,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('rejects unknown finish taxonomy slugs', async () => {
    repo.findImageWithOwner.mockResolvedValue(image);
    repo.taxonomySlugsExist.mockImplementation(async (kind) => kind !== 'finish');

    await expect(
      mediaService.updateImageMetadata({
        imageId: 'img-1',
        metadata: { finishSlugs: ['not-real'] },
        ...OWNER,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.taxonomySlugsExist).toHaveBeenCalledWith('finish', ['not-real']);
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('rejects unknown material taxonomy slugs', async () => {
    repo.findImageWithOwner.mockResolvedValue(image);
    repo.taxonomySlugsExist.mockImplementation(async (kind) => kind !== 'material');

    await expect(
      mediaService.updateImageMetadata({
        imageId: 'img-1',
        metadata: { materialSlugs: ['not-real'] },
        ...OWNER,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.taxonomySlugsExist).toHaveBeenCalledWith('material', ['not-real']);
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('rejects unknown theme taxonomy slugs', async () => {
    repo.findImageWithOwner.mockResolvedValue(image);
    repo.taxonomySlugsExist.mockResolvedValueOnce(false);

    await expect(
      mediaService.updateImageMetadata({
        imageId: 'img-1',
        metadata: { themeSlugs: ['not-real'] },
        ...OWNER,
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.taxonomySlugsExist).toHaveBeenCalledWith('theme', ['not-real']);
    expect(repo.updateMetadata).not.toHaveBeenCalled();
  });

  it('updates room and taxonomy metadata for the owner', async () => {
    repo.findImageWithOwner.mockResolvedValue(image);
    repo.roomBelongsToProject.mockResolvedValue(true);
    repo.updateMetadata.mockResolvedValue({
      id: 'img-1',
      roomId: '33333333-3333-4333-8333-333333333333',
      status: 'ready',
      sortOrder: 2,
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['veneer'],
      tagSlugs: ['hero'],
      width: 1600,
      height: 1200,
      derivatives: [],
    } as never);

    const result = await mediaService.updateImageMetadata({
      imageId: 'img-1',
      metadata: {
        roomId: '33333333-3333-4333-8333-333333333333',
        sortOrder: 2,
        themeSlugs: ['modern'],
        materialSlugs: ['wood'],
        finishSlugs: ['veneer'],
        tagSlugs: ['hero'],
      },
      ...OWNER,
    });

    expect(repo.updateMetadata).toHaveBeenCalledWith('img-1', {
      roomId: '33333333-3333-4333-8333-333333333333',
      sortOrder: 2,
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['veneer'],
      tagSlugs: ['hero'],
    });
    expect(result).toMatchObject({ roomId: '33333333-3333-4333-8333-333333333333' });
  });
});
