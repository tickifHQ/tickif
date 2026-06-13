import type {
  UploadUrlRequest,
  UploadUrlResponse,
  ListProjectImagesResponse,
  CommitUploadResponse,
  ProjectImageDto,
} from '@repo/contracts';
import { config } from '@repo/config';
import { buildOriginalKey, presignUpload, objectExists } from '@repo/storage';
import { enqueueMedia } from '@repo/queue';
import { AppError } from '../../lib/errors.js';
import { mediaRepository, type ProjectImageListItem } from './repository.js';

function toImageDto(row: ProjectImageListItem): ProjectImageDto {
  return {
    id: row.id,
    status: row.status,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    derivatives: row.derivatives ?? [],
  };
}

/**
 * Media use-cases. Framework-free: imports the repository and the storage
 * wrapper, never Hono or Drizzle.
 */
export const mediaService = {
  async createUploadUrl(
    input: UploadUrlRequest & { userId: string },
  ): Promise<UploadUrlResponse> {
    if (input.size !== undefined && input.size > config.MEDIA_MAX_UPLOAD_BYTES) {
      throw new AppError(
        'file_too_large',
        `Declared size exceeds the ${config.MEDIA_MAX_UPLOAD_BYTES}-byte limit`,
        422,
      );
    }

    const owner = await mediaRepository.findProjectOwner(input.projectId);
    // 404 (not 403) when missing so we don't leak which project ids exist.
    if (!owner) throw AppError.notFound('Project not found');
    if (owner.ownerUserId !== input.userId) throw AppError.forbidden();

    const key = buildOriginalKey(input.projectId);
    const image = await mediaRepository.createProcessing({
      projectId: input.projectId,
      originalKey: key,
      contentType: input.contentType,
    });
    const uploadUrl = await presignUpload({ key, contentType: input.contentType });

    return { imageId: image.id, uploadUrl, key };
  },

  /** Called after the client has PUT the bytes to R2; enqueues async processing. */
  async commitUpload(input: { imageId: string; userId: string }): Promise<CommitUploadResponse> {
    const image = await mediaRepository.findImageWithOwner(input.imageId);
    if (!image) throw AppError.notFound('Image not found');
    if (image.ownerUserId !== input.userId) throw AppError.forbidden();
    // Only a freshly-minted row may be committed; a replay (already ready/failed) is a no-op conflict.
    if (image.status !== 'processing') {
      throw AppError.conflict('Image has already been committed');
    }
    // Don't enqueue work for an object the client never actually uploaded.
    if (!(await objectExists(image.originalKey))) {
      throw AppError.badRequest('No uploaded object found for this image');
    }

    await enqueueMedia({ imageId: image.id, storageKey: image.originalKey });
    return { imageId: image.id, status: 'processing' };
  },

  async listProjectImages(input: {
    projectId: string;
    userId: string;
    limit: number;
    offset: number;
  }): Promise<ListProjectImagesResponse> {
    const owner = await mediaRepository.findProjectOwner(input.projectId);
    if (!owner) throw AppError.notFound('Project not found');
    if (owner.ownerUserId !== input.userId) throw AppError.forbidden();

    const rows = await mediaRepository.listByProject(input.projectId, {
      limit: input.limit,
      offset: input.offset,
    });
    return { items: rows.map(toImageDto) };
  },
};
