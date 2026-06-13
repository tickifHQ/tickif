import sharp from 'sharp';

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
};

function encode(pipeline: sharp.Sharp, format: DerivativeFormat): sharp.Sharp {
  return format === 'webp' ? pipeline.webp({ quality: 82 }) : pipeline.avif({ quality: 50 });
}

/**
 * Generate EXIF-stripped WebP + AVIF derivatives at the configured sizes.
 * `rotate()` bakes EXIF orientation into pixels; sharp drops all other metadata
 * (EXIF/GPS/ICC) on output by default, so derivatives carry no original metadata.
 * `withoutEnlargement` keeps small originals from being upscaled.
 */
export async function generateDerivatives(
  input: Buffer,
  options: GenerateOptions = {},
): Promise<GeneratedDerivative[]> {
  const variants = options.variants ?? MEDIA_VARIANTS;
  const formats = options.formats ?? MEDIA_FORMATS;
  const results: GeneratedDerivative[] = [];

  for (const spec of variants) {
    const base = sharp(input)
      .rotate()
      .resize({ width: spec.width, withoutEnlargement: true });
    for (const format of formats) {
      const { data, info } = await encode(base.clone(), format).toBuffer({
        resolveWithObject: true,
      });
      results.push({
        variant: spec.variant,
        format,
        contentType: FORMAT_CONTENT_TYPE[format],
        buffer: data,
        width: info.width,
        height: info.height,
      });
    }
  }

  return results;
}
