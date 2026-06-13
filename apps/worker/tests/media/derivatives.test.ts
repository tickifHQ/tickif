import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import {
  generateDerivatives,
  MEDIA_VARIANTS,
  MEDIA_FORMATS,
} from '../../src/media/derivatives.js';

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
});
