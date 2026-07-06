import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { buildWatermarkSvg, type WatermarkConfig } from '../../src/media/watermark.js';
import { generateDerivatives } from '../../src/media/derivatives.js';

const wm: WatermarkConfig = {
  text: 'Tickif',
  opacity: 0.8,
  scale: 0.3,
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
  it('produces a full-canvas tiled SVG sharp can rasterize', async () => {
    const svg = buildWatermarkSvg(800, 600, wm);
    const text = svg.toString();
    expect(text.match(/Tickif/g)?.length).toBeGreaterThan(6);

    const meta = await sharp(svg).metadata();
    expect(meta.format).toBe('svg');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('escapes XML-significant characters in the text', () => {
    const svg = buildWatermarkSvg(800, 600, { ...wm, text: 'A & B <x>' }).toString();
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
