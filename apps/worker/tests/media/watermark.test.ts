import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { buildWatermarkSvg, type WatermarkConfig } from '../../src/media/watermark.js';
import { generateDerivatives } from '../../src/media/derivatives.js';

const wm: WatermarkConfig = {
  text: 'TICKIF',
  opacity: 0.32,
  scale: 0.09,
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
  it('renders two translucent white marks without a badge', async () => {
    const svg = buildWatermarkSvg(880, 760, wm);
    const text = svg.toString();
    expect(text).not.toContain('<rect');
    expect(text.match(/<text /g)).toHaveLength(2);
    expect(text).toContain('font-family="JetBrains Mono, monospace"');
    expect(text).toContain('fill-opacity="0.32"');

    const { data, info } = await sharp(svg)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const regions = { center: 0, corner: 0, elsewhere: 0 };
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 4;
        const alpha = data[offset + 3]!;
        if (!alpha) continue;
        expect(alpha).toBeLessThanOrEqual(82);
        expect(data[offset]).toBe(255);
        expect(data[offset + 1]).toBe(255);
        expect(data[offset + 2]).toBe(255);
        if (x >= 395 && x <= 485 && y >= 368 && y <= 390) regions.center++;
        else if (x >= 760 && x <= 850 && y >= 718 && y <= 740) regions.corner++;
        else regions.elsewhere++;
      }
    }
    expect(regions.center).toBeGreaterThan(100);
    expect(regions.corner).toBeGreaterThan(100);
    expect(regions.elsewhere).toBe(0);
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

  it('escapes XML-significant characters in the text', () => {
    const svg = buildWatermarkSvg(800, 600, { ...wm, text: 'A & B <x>' }).toString();
    expect(svg).toContain('A &amp; B &lt;x&gt;');
  });
});

describe('generateDerivatives with watermark', () => {
  it.each(['webp', 'avif'] as const)(
    'marks both regions in %s public derivatives',
    async (format) => {
      const [marked] = await generateDerivatives(solid, {
        variants: [{ variant: 'large', width: 800 }],
        formats: [format],
        watermark: wm,
      });
      for (const region of [
        { left: 350, top: 280, width: 100, height: 40 },
        { left: 690, top: 550, width: 100, height: 45 },
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
