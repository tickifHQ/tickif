import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { socialImageData } from '@/lib/social-image';

vi.mock('@/env', () => ({ env: { R2_ENDPOINT: 'https://storage.example.test' } }));
afterEach(() => vi.unstubAllGlobals());

describe('social image embedding', () => {
  it('rejects external URLs without requesting them', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await socialImageData('http://169.254.169.254/secret')).toBeNull();
    expect(await socialImageData('https://storage.example.test.attacker.test/file')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('decodes an approved WebP derivative to an embeddable PNG', async () => {
    const webp = await sharp({
      create: { width: 40, height: 10, channels: 4, background: '#abcdef' },
    })
      .webp()
      .toBuffer();
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(webp, { headers: { 'content-type': 'image/webp' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await socialImageData(
      'https://storage.example.test/derivatives/approved.webp?signature=temporary',
    );
    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
  });

  it.each([
    new Response('missing', { status: 404 }),
    new Response('<svg />', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response('corrupt', { headers: { 'content-type': 'image/png' } }),
    new Response('too large', {
      headers: { 'content-type': 'image/png', 'content-length': '99999999' },
    }),
  ])(
    'degrades failed, unsupported, corrupt and oversized media to the branded fallback',
    async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      expect(await socialImageData('https://storage.example.test/derivatives/asset')).toBeNull();
    },
  );

  it('falls back on a timeout or a redirect rejected by fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('redirect rejected')));
    expect(await socialImageData('https://storage.example.test/derivatives/asset')).toBeNull();
  });

  it.each([
    [40, 10],
    [10, 40],
    [40, 40],
  ])(
    'preserves %s×%s artwork inside circular frames without changing saved square crops',
    async (width, height) => {
      const original = await sharp({
        create: { width, height, channels: 4, background: '#abcdef' },
      })
        .png()
        .toBuffer();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(new Response(original, { headers: { 'content-type': 'image/png' } })),
      );
      const result = await socialImageData('https://storage.example.test/logo.png', {
        circularLogo: true,
      });
      expect(result).not.toBeNull();
      const decoded = sharp(Buffer.from(result!.split(',')[1]!, 'base64'));
      const metadata = await decoded.metadata();
      const side = width === height ? width : Math.ceil(Math.hypot(width, height));
      expect(metadata.width).toBe(side);
      expect(metadata.height).toBe(side);
      const pixels = await decoded.ensureAlpha().raw().toBuffer();
      expect(pixels[3]).toBe(width === height ? 255 : 0);
    },
  );
});
