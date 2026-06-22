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

/** The authenticated caller, as resolved by the route from the session. */
export type Caller = { userId: string; userRole: string };

function toImageDto(row: ProjectImageListItem): ProjectImageDto {
  return {
    id: row.id,
    status: row.status,
    sortOrder: row.sortOrder,
    width: row.width,
    height: row.height,
    derivatives: row.derivatives,
  };
}

/**
 * Single authorization gate for every media use-case. Matches the canonical
 * requireOwnership policy: the resource owner or a superadmin (moderation) may act.
 * Org-member access lands when designer_profile ↔ organization is modeled (E-66).
 */
function assertAccess(ownerUserId: string | null, caller: Caller): void {
  if (caller.userRole === 'superadmin') return;
  if (ownerUserId && ownerUserId === caller.userId) return;
  throw AppError.forbidden();
}

/**
 * Media use-cases. Framework-free: imports the repository and the storage
 * wrapper, never Hono or Drizzle.
 */
export const mediaService = {
  async createUploadUrl(input: UploadUrlRequest & Caller): Promise<UploadUrlResponse> {
    if (input.size > config.MEDIA_MAX_UPLOAD_BYTES) {
      throw new AppError(
        'file_too_large',
        `Declared size exceeds the ${config.MEDIA_MAX_UPLOAD_BYTES}-byte limit`,
        422,
      );
    }

    const owner = await mediaRepository.findProjectOwner(input.projectId);
    // 404 (not 403) when missing so we don't leak which project ids exist.
    if (!owner) throw AppError.notFound('Project not found');
    assertAccess(owner.ownerUserId, input);

    const key = buildOriginalKey(input.projectId);
    const image = await mediaRepository.createProcessing({
      projectId: input.projectId,
      originalKey: key,
      contentType: input.contentType,
    });
    const uploadUrl = await presignUpload({
      key,
      contentType: input.contentType,
      contentLength: input.size,
    });

    return { imageId: image.id, uploadUrl, key };
  },

  /** Called after the client has PUT the bytes to R2; enqueues async processing. */
  async commitUpload(input: { imageId: string } & Caller): Promise<CommitUploadResponse> {
    const image = await mediaRepository.findImageWithOwner(input.imageId);
    if (!image) throw AppError.notFound('Image not found');
    assertAccess(image.ownerUserId, input);
    // Only a freshly-minted row may be committed; a replay (already ready/failed) is a no-op conflict.
    if (image.status !== 'processing') {
      throw AppError.conflict('Image has already been committed');
    }
    // Don't enqueue work for an object the client never actually uploaded.
    if (!(await objectExists(image.originalKey))) {
      throw AppError.badRequest('No uploaded object found for this image');
    }

    await enqueueMedia({ imageId: image.id });
    return { imageId: image.id, status: 'processing' };
  },

  async listProjectImages(
    input: { projectId: string; limit: number; offset: number } & Caller,
  ): Promise<ListProjectImagesResponse> {
    const owner = await mediaRepository.findProjectOwner(input.projectId);
    if (!owner) throw AppError.notFound('Project not found');
    assertAccess(owner.ownerUserId, input);

    const rows = await mediaRepository.listByProject(input.projectId, {
      limit: input.limit,
      offset: input.offset,
    });
    return { items: rows.map(toImageDto) };
  },
};
