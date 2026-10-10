import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { buildWatermarkSvg, type WatermarkConfig } from '../../src/media/watermark.js';
import { generateDerivatives } from '../../src/media/derivatives.js';

const wm: WatermarkConfig = {
  opacity: 1,
  scale: 0.0432,
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
  it('renders the supplied logo at top left, center and bottom right', async () => {
    const svg = buildWatermarkSvg(278, 379, wm);
    expect(svg.toString()).not.toContain('<text');
    const { data, info } = await sharp(svg)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const regions = { header: 0, center: 0, corner: 0, elsewhere: 0 };
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3]!;
        if (!alpha) continue;
        expect(alpha).toBeLessThanOrEqual(111);
        if (x >= 14 && x <= 61 && y >= 13 && y <= 32) regions.header++;
        else if (x >= 128 && x <= 149 && y >= 178 && y <= 201) regions.center++;
        else if (x >= 249 && x <= 271 && y >= 350 && y <= 373) regions.corner++;
        else regions.elsewhere++;
      }
    }
    expect(regions.header).toBeGreaterThan(50);
    expect(regions.center).toBeGreaterThan(20);
    expect(regions.corner).toBeGreaterThan(20);
    expect(regions.elsewhere).toBe(0);
  });

  it('can reduce or hide the complete logo treatment', async () => {
    const full = await sharp(buildWatermarkSvg(278, 379, wm))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const faded = await sharp(buildWatermarkSvg(278, 379, { ...wm, opacity: 0.5 }))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const hidden = await sharp(buildWatermarkSvg(278, 379, { ...wm, opacity: 0 }))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const alpha = (buffer: Buffer) => buffer.filter((_, index) => index % 4 === 3);
    expect(Math.max(...alpha(faded))).toBeLessThan(Math.max(...alpha(full)));
    expect(Math.max(...alpha(hidden))).toBe(0);
  });

  it.each([
    [320, 180],
    [320, 480],
    [150, 100],
    [1000, 40],
    [40, 1000],
  ])('keeps marks inside %i × %i images', async (width, height) => {
    const svg = buildWatermarkSvg(width, height, wm);
    const { data, info } = await sharp(svg)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let visible = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * info.channels + 3]!;
        if (!alpha) continue;
        visible++;
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(width - 1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(height - 1);
      }
    }
    expect(visible).toBeGreaterThan(0);
  });
});

describe('generateDerivatives with watermark', () => {
  it.each(['webp', 'avif'] as const)(
    'marks all three regions in %s public derivatives',
    async (format) => {
      const [marked] = await generateDerivatives(solid, {
        variants: [{ variant: 'large', width: 800 }],
        formats: [format],
        watermark: wm,
      });
      for (const region of [
        { left: 40, top: 35, width: 145, height: 65 },
        { left: 350, top: 280, width: 100, height: 40 },
        { left: 710, top: 515, width: 80, height: 75 },
      ]) {
        const pixels = await sharp(marked!.buffer).extract(region).raw().toBuffer();
        expect(Math.max(...pixels.filter((_, index) => index % 3 === 0))).toBeGreaterThan(30);
      }
      const bottomCenter = await sharp(marked!.buffer)
        .extract({ left: 350, top: 550, width: 100, height: 45 })
        .png()
        .toBuffer();
      expect(await meanStdev(bottomCenter)).toBeLessThan(1);
    },
  );

  it('keeps small public derivatives protected with a scaled-down mark', async () => {
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
