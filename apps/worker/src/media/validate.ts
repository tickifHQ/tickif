import sharp from 'sharp';
import { config } from '@repo/config';
import type { AllowedImageContentType } from '@repo/contracts';

export type MediaLimits = {
  maxBytes: number;
  maxDimension: number;
  maxPixels: number;
};

export const defaultMediaLimits: MediaLimits = {
  maxBytes: config.MEDIA_MAX_UPLOAD_BYTES,
  maxDimension: config.MEDIA_MAX_IMAGE_DIMENSION,
  maxPixels: config.MEDIA_MAX_IMAGE_PIXELS,
};

const FORMAT_TO_MIME: Record<string, AllowedImageContentType> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export type ValidationFailure =
  | 'empty'
  | 'too_large'
  | 'corrupt'
  | 'unsupported_format'
  | 'content_type_mismatch'
  | 'dimensions_exceeded'
  | 'decompression_bomb';

export type ValidationResult =
  | { ok: true; format: AllowedImageContentType; width: number; height: number }
  | { ok: false; reason: ValidationFailure };

/**
 * Authoritative byte-level validation (stage 2). Reads format + dimensions from
 * the header only; the pixel-budget check rejects decompression bombs before any
 * full decode. `declaredContentType` is the type pinned at mint (E-106).
 */
export async function validateImageBytes(
  buffer: Buffer,
  declaredContentType: string,
  limits: MediaLimits = defaultMediaLimits,
): Promise<ValidationResult> {
  if (buffer.byteLength === 0) return { ok: false, reason: 'empty' };
  if (buffer.byteLength > limits.maxBytes) return { ok: false, reason: 'too_large' };

  let format: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  try {
    // metadata() parses the header only (no bitmap allocation), so it's safe to
    // read dimensions before the pixel-budget check below rejects bombs.
    ({ format, width, height } = await sharp(buffer).metadata());
  } catch {
    return { ok: false, reason: 'corrupt' };
  }

  const realMime = format ? FORMAT_TO_MIME[format] : undefined;
  if (!realMime) return { ok: false, reason: 'unsupported_format' };
  if (realMime !== declaredContentType) return { ok: false, reason: 'content_type_mismatch' };
  if (!width || !height) return { ok: false, reason: 'corrupt' };
  if (width > limits.maxDimension || height > limits.maxDimension) {
    return { ok: false, reason: 'dimensions_exceeded' };
  }
  if (width * height > limits.maxPixels) return { ok: false, reason: 'decompression_bomb' };

  return { ok: true, format: realMime, width, height };
}
