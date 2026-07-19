import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { buildWatermarkSvg, type WatermarkConfig } from '../../src/media/watermark.js';
import { generateDerivatives } from '../../src/media/derivatives.js';

const wm: WatermarkConfig = {
  text: 'tickif',
  opacity: 0.22,
  scale: 0.16,
  rotation: -30,
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
  it('produces a restrained, staggered full-canvas pattern sharp can rasterize', async () => {
    const svg = buildWatermarkSvg(800, 600, wm);
    const text = svg.toString();
    expect(text).toContain('<pattern');
    expect(text).toContain('patternTransform="rotate(-30)"');
    expect(text.match(/<text[^>]*>tickif<\/text>/g)?.length).toBe(2);
    expect(text).toContain('fill-opacity="0.22"');

    const fontSize = Number(text.match(/font-size="([\d.]+)"/)?.[1]);
    expect(fontSize).toBeGreaterThanOrEqual(20);
    expect(fontSize).toBeLessThanOrEqual(40);

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

  it('keeps small public derivatives protected with a scaled-down pattern', async () => {
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

    expect(await meanStdev(marked!.buffer)).toBeGreaterThan((await meanStdev(plain!.buffer)) + 0.5);
  });

  it('uses the actual resized dimensions when compositing the watermark', async () => {
    const halfPixelResize = await sharp({
      create: { width: 640, height: 401, channels: 3, background: 'blue' },
    })
      .jpeg()
      .toBuffer();

    const [marked] = await generateDerivatives(halfPixelResize, {
      variants: [{ variant: 'thumb', width: 320 }],
      formats: ['webp'],
      watermark: wm,
    });

    expect(marked).toMatchObject({ width: 320 });
    await expect(sharp(marked!.buffer).metadata()).resolves.toMatchObject({
      width: marked!.width,
      height: marked!.height,
    });
  });
});
