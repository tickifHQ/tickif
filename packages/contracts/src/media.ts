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
    // Required: pinned into the presigned URL's ContentLength so the upload can't exceed it.
    size: z.number().int().positive(),
  })
  .meta({
    id: 'UploadUrlRequest',
    example: {
      projectId: '6f9619ff-8b86-d011-b42d-00cf4fc964ff',
      contentType: 'image/jpeg',
      size: 2_400_000,
    },
  });
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z
  .object({
    imageId: z.uuid(),
    uploadUrl: z.url(),
    key: z.string(),
  })
  .meta({
    id: 'UploadUrlResponse',
    example: {
      imageId: '0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
      uploadUrl:
        'https://tickif-media.r2.cloudflarestorage.com/originals/6f9619ff-8b86-d011-b42d-00cf4fc964ff/0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e?X-Amz-Signature=...',
      key: 'originals/6f9619ff-8b86-d011-b42d-00cf4fc964ff/0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
    },
  });
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const imageStatus = z.enum(['processing', 'ready', 'failed']);
export type ImageStatus = z.infer<typeof imageStatus>;

export const derivativeSchema = z.object({
  variant: z.string(),
  format: z.string(),
  key: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type Derivative = z.infer<typeof derivativeSchema>;

export const projectImageSchema = z
  .object({
    id: z.uuid(),
    status: imageStatus,
    sortOrder: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    derivatives: z.array(derivativeSchema),
  })
  .meta({ id: 'ProjectImage' });
export type ProjectImageDto = z.infer<typeof projectImageSchema>;

export const listProjectImagesResponseSchema = z
  .object({ items: z.array(projectImageSchema) })
  .meta({ id: 'ListProjectImages' });
export type ListProjectImagesResponse = z.infer<typeof listProjectImagesResponseSchema>;

export const commitUploadResponseSchema = z
  .object({ imageId: z.uuid(), status: imageStatus })
  .meta({
    id: 'CommitUpload',
    example: {
      imageId: '0d8e6a2c-1b3f-4c5a-9e2d-7f1a2b3c4d5e',
      status: 'processing',
    },
  });
export type CommitUploadResponse = z.infer<typeof commitUploadResponseSchema>;

export const imageIdParamSchema = z.object({ imageId: z.uuid() }).meta({ id: 'ImageIdParam' });
export const projectImagesParamSchema = z
  .object({ id: z.uuid() })
  .meta({ id: 'ProjectImagesParam' });

// Query strings arrive as text, so coerce; bounds keep an unbounded scan off the table.
export const listProjectImagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .meta({ id: 'ListProjectImagesQuery' });
export type ListProjectImagesQuery = z.infer<typeof listProjectImagesQuerySchema>;
