import { describe, it, expect } from 'vitest';
import { buildOriginalKey, presignUpload, ORIGINALS_PREFIX } from '../src/index.js';

describe('buildOriginalKey', () => {
  it('produces a non-sequential private key under the originals prefix', () => {
    const projectId = '11111111-1111-1111-1111-111111111111';
    const a = buildOriginalKey(projectId);
    const b = buildOriginalKey(projectId);

    expect(a).toMatch(
      new RegExp(`^${ORIGINALS_PREFIX}/${projectId}/[0-9a-f-]{36}$`),
    );
    expect(a).not.toBe(b);
  });
});

describe('presignUpload', () => {
  it('mints a signed PUT URL with the key, pinned expiry, and signature', async () => {
    const key = 'originals/p/abc';
    const url = await presignUpload({ key, contentType: 'image/jpeg', expiresIn: 900 });
    const parsed = new URL(url);

    expect(parsed.pathname).toContain(key);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(parsed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  });

  it('defaults expiry to the configured value', async () => {
    const url = await presignUpload({ key: 'originals/p/def', contentType: 'image/png' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600');
  });

  // Regression: a default CRC32 trailer signed into the URL makes R2/MinIO reject the
  // browser PUT (NotImplemented). The presigned URL must carry no checksum params.
  it('does not sign a checksum into the URL', async () => {
    const url = await presignUpload({ key: 'originals/p/ghi', contentType: 'image/webp' });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
    expect(parsed.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.toLowerCase()).not.toContain('x-amz-checksum');
  });
});
