import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { computePhash, hammingDistance, findNearestDuplicate } from '../../src/media/phash.js';

function gradient(shift = 0): Promise<Buffer> {
  const w = 256;
  const h = 256;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      buf[i] = (x + shift) % 256;
      buf[i + 1] = y % 256;
      buf[i + 2] = ((x + y) >> 1) % 256;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function stripes(): Promise<Buffer> {
  const w = 256;
  const h = 256;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const v = Math.floor(x / 8) % 2 === 0 ? 255 : 0;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

let base: Buffer;
let near: Buffer;
let recompressed: Buffer;
let distinct: Buffer;

beforeAll(async () => {
  base = await gradient(0);
  near = await sharp(base).modulate({ brightness: 1.05 }).png().toBuffer();
  recompressed = await sharp(base).jpeg({ quality: 40 }).toBuffer();
  distinct = await stripes();
});

describe('computePhash', () => {
  it('is a stable 16-char hex hash', async () => {
    const h = await computePhash(base);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(await computePhash(base)).toBe(h);
  });

  it('is identical for the same image (distance 0)', async () => {
    expect(hammingDistance(await computePhash(base), await computePhash(base))).toBe(0);
  });

  it('stays close for a near-identical / recompressed image', async () => {
    expect(hammingDistance(await computePhash(base), await computePhash(near))).toBeLessThanOrEqual(8);
    expect(
      hammingDistance(await computePhash(base), await computePhash(recompressed)),
    ).toBeLessThanOrEqual(8);
  });

  it('diverges for a visually distinct image', async () => {
    expect(hammingDistance(await computePhash(base), await computePhash(distinct))).toBeGreaterThan(
      10,
    );
  });
});

describe('hammingDistance', () => {
  it('counts differing bits', () => {
    expect(hammingDistance('0000', '0000')).toBe(0);
    expect(hammingDistance('000f', '0000')).toBe(4);
    expect(hammingDistance('ffff', '0000')).toBe(16);
  });

  it('throws on length mismatch', () => {
    expect(() => hammingDistance('00', '0000')).toThrow();
  });
});

describe('findNearestDuplicate', () => {
  const candidates = [
    { imageId: 'a', phash: '0000000000000000' },
    { imageId: 'b', phash: 'ffffffffffffffff' },
  ];

  it('returns the closest within threshold', () => {
    const res = findNearestDuplicate('0000000000000001', candidates, 5);
    expect(res).toEqual({ imageId: 'a', distance: 1 });
  });

  it('returns null when nothing is within threshold', () => {
    expect(findNearestDuplicate('0f0f0f0f0f0f0f0f', candidates, 3)).toBeNull();
  });
});
