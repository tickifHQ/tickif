import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { generateDerivatives, MEDIA_VARIANTS, MEDIA_FORMATS } from '../../src/media/derivatives.js';
import { readImageSignature, signatureToken } from '../../src/media/signature.js';

let source: Buffer;
let orientedSource: Buffer;

beforeAll(async () => {
  source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: 'blue' },
  })
    .jpeg()
    .toBuffer();

  // 40x30 landscape tagged orientation 6 (rotate 90°) → should become portrait after rotate().
  orientedSource = await sharp({
    create: { width: 40, height: 30, channels: 3, background: 'green' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
});

describe('generateDerivatives', () => {
  it('generates a high-density gallery variant without enlarging the source', async () => {
    expect(MEDIA_VARIANTS).toContainEqual({ variant: 'xlarge', width: 2560 });
    const [derivative] = await generateDerivatives(source, {
      variants: [{ variant: 'xlarge', width: 2560 }],
      formats: ['webp'],
    });
    expect(derivative?.width).toBe(2000);
    expect(derivative?.height).toBe(1000);
  });

  it('produces every variant × format', async () => {
    const out = await generateDerivatives(source);
    expect(out).toHaveLength(MEDIA_VARIANTS.length * MEDIA_FORMATS.length);
    for (const f of MEDIA_FORMATS) {
      expect(out.filter((d) => d.format === f)).toHaveLength(MEDIA_VARIANTS.length);
    }
  });

  it('emits buffers actually encoded in the claimed format at the resized width', async () => {
    const out = await generateDerivatives(source, {
      variants: [{ variant: 'thumb', width: 320 }],
      formats: ['webp', 'avif'],
    });

    // sharp reads an AVIF (HEIF container) back as format 'heif'.
    const readBackFormat = { webp: 'webp', avif: 'heif' } as const;
    for (const d of out) {
      const meta = await sharp(d.buffer).metadata();
      expect(meta.format).toBe(readBackFormat[d.format]);
      expect(meta.width).toBe(320);
      expect(d.width).toBe(320);
      // aspect preserved (2000x1000 → 320x160)
      expect(d.height).toBe(160);
    }
  });

  it('never enlarges an original smaller than the variant width', async () => {
    const small = await sharp({
      create: { width: 100, height: 80, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();

    const [d] = await generateDerivatives(small, {
      variants: [{ variant: 'large', width: 1600 }],
      formats: ['webp'],
    });
    expect(d!.width).toBe(100);
    expect(d!.height).toBe(80);
  });

  it('honors EXIF orientation then strips all metadata', async () => {
    const [d] = await generateDerivatives(orientedSource, {
      variants: [{ variant: 'thumb', width: 320 }],
      formats: ['webp'],
    });

    // orientation 6 rotates 40x30 → 30x40 (portrait), not upscaled
    expect(d!.width).toBe(30);
    expect(d!.height).toBe(40);

    const meta = await sharp(d!.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it.each([
    { width: 640, height: 480 },
    { width: 480, height: 640 },
  ])('preserves color detail in a $width by $height AVIF derivative', async ({ width, height }) => {
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        pixels[offset] = Math.floor((x * 255) / width);
        pixels[offset + 1] = Math.floor((y * 255) / height);
        pixels[offset + 2] = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 180 + 40;
      }
    }
    const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
    const [derivative] = await generateDerivatives(original, {
      variants: [{ variant: 'preview', width }],
      formats: ['avif'],
    });
    const decoded = await sharp(derivative!.buffer).raw().toBuffer();
    expect(derivative!.width).toBe(width);
    expect(derivative!.height).toBe(height);
    expect(decoded.length).toBe(pixels.length);
    const absoluteError = decoded.reduce(
      (sum, value, index) => sum + Math.abs(value - pixels[index]!),
      0,
    );
    // Verify encoded output rather than its options: gradients and checker edges
    // must retain their color detail across both portrait and landscape frames.
    expect(absoluteError / pixels.length).toBeLessThan(6);
  });

  it.each(['webp', 'avif'] as const)(
    'embeds an identifiable image signature in a %s public derivative',
    async (format) => {
      const imageId = '12345678-90ab-4cde-8f01-23456789abcd';
      const photo = await readFile(
        new URL(
          '../../../web/public/images/home-hero/warm-pendant-living-room.jpg',
          import.meta.url,
        ),
      );
      const original = Buffer.from(photo);
      const [derivative] = await generateDerivatives(photo, {
        variants: [{ variant: 'thumb', width: 320 }],
        formats: [format],
        watermark: { opacity: 1, scale: 0.0432 },
        signatureId: imageId,
      });

      expect(await readImageSignature(derivative!.buffer)).toBe(signatureToken(imageId));
      expect(photo).toEqual(original);
    },
  );

  it('does not mistake an ordinary derivative for a signed image', async () => {
    const [derivative] = await generateDerivatives(source, {
      variants: [{ variant: 'thumb', width: 320 }],
      formats: ['webp'],
    });
    expect(await readImageSignature(derivative!.buffer)).toBeNull();
  });

  it.each([
    { photo: 'bright-kitchen-living-room.jpg', width: 640, format: 'avif' as const },
    { photo: 'neutral-living-room.jpg', width: 1024, format: 'webp' as const },
    { photo: 'neutral-living-room.jpg', width: 1600, format: 'avif' as const },
    { photo: 'warm-pendant-living-room.jpg', width: 1600, format: 'avif' as const },
  ])(
    'retains the token with restrained perturbation: $photo $format',
    async ({ photo, width, format }) => {
      const input = await readFile(
        new URL(`../../../web/public/images/home-hero/${photo}`, import.meta.url),
      );
      const [derivative] = await generateDerivatives(input, {
        variants: [{ variant: 'preview', width }],
        formats: [format],
        watermark: { opacity: 1, scale: 0.0432 },
        signatureId: 'image-two',
      });

      expect(await readImageSignature(derivative!.buffer)).toBe(signatureToken('image-two'));
    },
  );
});
