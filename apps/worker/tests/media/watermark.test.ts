import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { buildWatermarkSvg, type WatermarkConfig } from '../../src/media/watermark.js';
import { generateDerivatives } from '../../src/media/derivatives.js';

const wm: WatermarkConfig = {
  text: 'Tickif',
  opacity: 0.8,
  scale: 0.3,
  gravity: 'southeast',
  minImageWidth: 200,
};

async function meanStdev(buffer: Buffer): Promise<number> {
  const { channels } = await sharp(buffer).stats();
  return channels.reduce((sum, c) => sum + c.stdev, 0) / channels.length;
}

let solid: Buffer;
beforeAll(async () => {
  solid = await sharp({ create: { width: 800, height: 600, channels: 3, background: 'blue' } })
    .jpeg()
    .toBuffer();
});

describe('buildWatermarkSvg', () => {
  it('produces an SVG sharp can rasterize, containing the text', async () => {
    const svg = buildWatermarkSvg(800, wm);
    expect(svg.toString()).toContain('Tickif');
    const meta = await sharp(svg).metadata();
    expect(meta.format).toBe('svg');
  });

  it('escapes XML-significant characters in the text', () => {
    const svg = buildWatermarkSvg(800, { ...wm, text: 'A & B <x>' }).toString();
    expect(svg).toContain('A &amp; B &lt;x&gt;');
  });
});

describe('generateDerivatives with watermark', () => {
  it('marks public derivatives (adds visible variance to a solid image)', async () => {
    const [plain] = await generateDerivatives(solid, {
      variants: [{ variant: 'large', width: 800 }],
      formats: ['webp'],
    });
    const [marked] = await generateDerivatives(solid, {
      variants: [{ variant: 'large', width: 800 }],
      formats: ['webp'],
      watermark: wm,
    });

    expect(await meanStdev(marked!.buffer)).toBeGreaterThan((await meanStdev(plain!.buffer)) + 2);
  });

  it('skips the watermark for images below minImageWidth', async () => {
    const small = await sharp({
      create: { width: 150, height: 100, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer();

    const [plain] = await generateDerivatives(small, {
      variants: [{ variant: 'thumb', width: 150 }],
      formats: ['webp'],
    });
    const [marked] = await generateDerivatives(small, {
      variants: [{ variant: 'thumb', width: 150 }],
      formats: ['webp'],
      watermark: wm,
    });

    expect(Math.abs((await meanStdev(marked!.buffer)) - (await meanStdev(plain!.buffer)))).toBeLessThan(0.5);
  });
});
