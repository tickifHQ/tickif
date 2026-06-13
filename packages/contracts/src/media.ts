import { z } from 'zod';

/**
 * Shared contracts for the `media` slice. Plain zod, no framework deps.
 */

/** Content types accepted for an original upload; pinned into the presigned PUT. */
export const allowedImageContentType = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
export type AllowedImageContentType = z.infer<typeof allowedImageContentType>;

export const uploadUrlRequestSchema = z
  .object({
    projectId: z.uuid(),
    contentType: allowedImageContentType,
  })
  .meta({ id: 'UploadUrlRequest' });
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z
  .object({
    imageId: z.uuid(),
    uploadUrl: z.url(),
    key: z.string(),
  })
  .meta({ id: 'UploadUrlResponse' });
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
