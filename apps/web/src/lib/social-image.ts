import { env } from '@/env';
import sharp from 'sharp';

// No CDN/browser retention: unpublishing takes effect at the next anonymous read.
// Social networks maintain their own preview caches outside Tickif's control.
export const SOCIAL_IMAGE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};
const MAX_BYTES = 6 * 1024 * 1024;

/** Only API-approved storage derivatives are fetched, never arbitrary user URLs. */
export async function socialImageData(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const endpoint =
    env.R2_ENDPOINT ??
    (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
  if (!endpoint) return null;
  try {
    const imageUrl = new URL(url);
    if (imageUrl.origin !== new URL(endpoint).origin || imageUrl.username || imageUrl.password)
      return null;
    const response = await fetch(imageUrl, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (
      !response.ok ||
      !response.body ||
      !/^image\/(png|jpeg|webp|avif)(;|$)/i.test(response.headers.get('content-type') ?? '')
    )
      return null;
    if (Number(response.headers.get('content-length')) > MAX_BYTES) {
      await response.body.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.length;
      if (length > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }
    // Satori embeds PNG/JPEG; public derivatives are normally WebP. Decoding also
    // rejects corrupt assets and limits decompression before ImageResponse runs.
    const png = await sharp(Buffer.concat(chunks), { limitInputPixels: 16_000_000 })
      .rotate()
      .resize({ width: 1200, height: 630, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}
