import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { embedImageSignature, readImageSignature, signatureToken } from '../../src/media/signature.js';

describe('image signatures', () => {
  it('recovers distinct IDs from losslessly encoded pixels without modifying alpha', async () => {
    const width = 256;
    const height = 192;
    for (const imageId of ['image-one', 'image-two']) {
      const pixels = Buffer.alloc(width * height * 4);
      for (let index = 0; index < width * height; index++) {
        pixels[index * 4] = 80 + (index % 90);
        pixels[index * 4 + 1] = 90 + (index % 70);
        pixels[index * 4 + 2] = 100 + (index % 60);
        pixels[index * 4 + 3] = 200;
      }

      expect(embedImageSignature(pixels, width, height, 4, imageId)).toBe(true);
      const encoded = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();

      expect(await readImageSignature(encoded)).toBe(signatureToken(imageId));
      expect(signatureToken(imageId)).not.toBe(signatureToken('unrelated-image'));
      for (let index = 3; index < pixels.length; index += 4) expect(pixels[index]).toBe(200);
    }
  });

  it('leaves images too small for a signature untouched', async () => {
    const pixels = Buffer.alloc(16 * 16 * 3, 128);
    const original = Buffer.from(pixels);

    expect(embedImageSignature(pixels, 16, 16, 3, 'image-one')).toBe(false);

    expect(pixels).toEqual(original);
    const encoded = await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } })
      .png()
      .toBuffer();
    expect(await readImageSignature(encoded)).toBeNull();
  });

  it('rejects corrupt image input', async () => {
    await expect(readImageSignature(Buffer.from('not an image'))).rejects.toThrow();
  });
});
