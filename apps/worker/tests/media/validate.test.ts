import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { validateImageBytes, type MediaLimits } from '../../src/media/validate.js';

const limits: MediaLimits = { maxBytes: 5_000_000, maxDimension: 100, maxPixels: 10_000 };

let pngBuf: Buffer;
let jpegBuf: Buffer;

beforeAll(async () => {
  const base = sharp({ create: { width: 40, height: 30, channels: 3, background: 'red' } });
  pngBuf = await base.clone().png().toBuffer();
  jpegBuf = await base.clone().jpeg().toBuffer();
});

describe('validateImageBytes', () => {
  it('accepts a valid PNG and reports real format + dimensions', async () => {
    const res = await validateImageBytes(pngBuf, 'image/png', limits);
    expect(res).toEqual({ ok: true, format: 'image/png', width: 40, height: 30 });
  });

  it('rejects an empty buffer', async () => {
    const res = await validateImageBytes(Buffer.alloc(0), 'image/png', limits);
    expect(res).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects a buffer over the byte cap', async () => {
    const res = await validateImageBytes(pngBuf, 'image/png', { ...limits, maxBytes: 10 });
    expect(res).toEqual({ ok: false, reason: 'too_large' });
  });

  it('rejects non-image bytes as corrupt', async () => {
    const res = await validateImageBytes(Buffer.from('not an image at all'), 'image/png', limits);
    expect(res).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects a forged content-type (real PNG declared as JPEG)', async () => {
    const res = await validateImageBytes(pngBuf, 'image/jpeg', limits);
    expect(res).toEqual({ ok: false, reason: 'content_type_mismatch' });
  });

  it('treats an empty declared content-type as a mismatch', async () => {
    const res = await validateImageBytes(pngBuf, '', limits);
    expect(res).toEqual({ ok: false, reason: 'content_type_mismatch' });
  });

  it('reports unsupported_format for a real but disallowed format (tiff)', async () => {
    const tiff = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } })
      .tiff()
      .toBuffer();
    const res = await validateImageBytes(tiff, 'image/tiff', limits);
    expect(res).toEqual({ ok: false, reason: 'unsupported_format' });
  });

  it('accepts a real JPEG declared as JPEG', async () => {
    const res = await validateImageBytes(jpegBuf, 'image/jpeg', limits);
    expect(res).toMatchObject({ ok: true, format: 'image/jpeg' });
  });

  it('rejects images over the max dimension', async () => {
    const res = await validateImageBytes(pngBuf, 'image/png', { ...limits, maxDimension: 20 });
    expect(res).toEqual({ ok: false, reason: 'dimensions_exceeded' });
  });

  it('rejects images over the pixel budget (decompression bomb)', async () => {
    const res = await validateImageBytes(pngBuf, 'image/png', {
      ...limits,
      maxDimension: 1000,
      maxPixels: 500,
    });
    expect(res).toEqual({ ok: false, reason: 'decompression_bomb' });
  });
});
