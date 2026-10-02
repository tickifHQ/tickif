import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { socialImageData } from '@/lib/social-image';

vi.mock('@repo/config', () => ({ config: { R2_ENDPOINT: 'https://storage.example.test' } }));
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
});
