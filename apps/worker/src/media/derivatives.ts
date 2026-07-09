import sharp from 'sharp';
import { config } from '@repo/config';
import { buildWatermarkSvg, type WatermarkConfig } from './watermark.js';

export type DerivativeFormat = 'webp' | 'avif';

export type VariantSpec = { variant: string; width: number };

/** Responsive sizes generated per original. Single place to tune (config-driven). */
export const MEDIA_VARIANTS: readonly VariantSpec[] = [
  { variant: 'thumb', width: 320 },
  { variant: 'small', width: 640 },
  { variant: 'medium', width: 1024 },
  { variant: 'large', width: 1600 },
];

export const MEDIA_FORMATS: readonly DerivativeFormat[] = ['webp', 'avif'];

const FORMAT_CONTENT_TYPE: Record<DerivativeFormat, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
};

export type GeneratedDerivative = {
  variant: string;
  format: DerivativeFormat;
  contentType: string;
  buffer: Buffer;
  width: number;
  height: number;
};

export type GenerateOptions = {
  variants?: readonly VariantSpec[];
  formats?: readonly DerivativeFormat[];
  /** When set, public derivatives are watermarked (E-109); the original is never touched. */
  watermark?: WatermarkConfig | null;
  /** Decompression-bomb guard at decode time; defaults to the configured pixel budget. */
  limitInputPixels?: number;
};

function encode(pipeline: sharp.Sharp, format: DerivativeFormat): sharp.Sharp {
  return format === 'webp' ? pipeline.webp({ quality: 82 }) : pipeline.avif({ quality: 50 });
}

/**
 * Stream EXIF-stripped WebP + AVIF derivatives one at a time. Decodes the original
 * ONCE to rotated raw pixels (variants resize from raw, never re-decoding full-res),
 * so peak memory is one derivative at a time rather than all of them.
 */
export async function* eachDerivative(
  input: Buffer,
  options: GenerateOptions = {},
): AsyncGenerator<GeneratedDerivative> {
  const variants = options.variants ?? MEDIA_VARIANTS;
  const formats = options.formats ?? MEDIA_FORMATS;
  const watermark = options.watermark;
  const limitInputPixels = options.limitInputPixels ?? config.MEDIA_MAX_IMAGE_PIXELS;

  const { data: raw, info } = await sharp(input, { limitInputPixels, failOn: 'error' })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawInput = {
    raw: { width: info.width, height: info.height, channels: info.channels },
    limitInputPixels,
  };

  for (const spec of variants) {
    const { data: resizedRaw, info: resizedInfo } = await sharp(raw, rawInput)
      .resize({ width: spec.width, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const resizedInput = {
      raw: {
        width: resizedInfo.width,
        height: resizedInfo.height,
        channels: resizedInfo.channels,
      },
      limitInputPixels,
    };
    const resized = sharp(resizedRaw, resizedInput);
    const base =
      watermark && resizedInfo.width >= watermark.minImageWidth
        ? resized.composite([
            { input: buildWatermarkSvg(resizedInfo.width, resizedInfo.height, watermark) },
          ])
        : resized;

    for (const format of formats) {
      const { data, info: out } = await encode(base.clone(), format).toBuffer({
        resolveWithObject: true,
      });
      yield {
        variant: spec.variant,
        format,
        contentType: FORMAT_CONTENT_TYPE[format],
        buffer: data,
        width: out.width,
        height: out.height,
      };
    }
  }
}

/** Eager wrapper: collects {@link eachDerivative} into an array (tests/non-streaming callers). */
export async function generateDerivatives(
  input: Buffer,
  options: GenerateOptions = {},
): Promise<GeneratedDerivative[]> {
  const results: GeneratedDerivative[] = [];
  for await (const derivative of eachDerivative(input, options)) results.push(derivative);
  return results;
}
