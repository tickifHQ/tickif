import type { UploadUrlRequest, UploadUrlResponse } from '@repo/contracts';
import { config } from '@repo/config';
import { buildOriginalKey, presignUpload } from '@repo/storage';
import { AppError } from '../../lib/errors.js';
import { mediaRepository } from './repository.js';

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
    });
    const uploadUrl = await presignUpload({ key, contentType: input.contentType });

    return { imageId: image.id, uploadUrl, key };
  },
};
