import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import sharp from 'sharp';

const r2 = new Map<string, Buffer>();
vi.mock('@repo/storage', () => ({
  getObject: vi.fn(async (key: string) => {
    const b = r2.get(key);
    if (!b) throw new Error(`mock R2: missing ${key}`);
    return b;
  }),
  putObject: vi.fn(async ({ key, body }: { key: string; body: Buffer }) => {
    r2.set(key, body);
  }),
  buildDerivativeKey: (p: string, i: string, v: string, f: string) =>
    `derivatives/${p}/${i}/${v}.${f}`,
}));

import { db, schema, eq } from '@repo/db';
import { makeProject, makeProjectImage } from '@repo/db/testing';
import { processMedia } from '../../src/jobs/media-process.js';
import { computePhash } from '../../src/media/phash.js';

const job = (imageId: string): Job<{ imageId: string; storageKey: string }> =>
  ({ id: 'j', data: { imageId, storageKey: 'k' } }) as Job<{
    imageId: string;
    storageKey: string;
  }>;

async function seedProcessing(bytes: Buffer) {
  const project = await makeProject();
  const originalKey = `originals/${project.id}/orig`;
  const image = await makeProjectImage({
    projectId: project.id,
    originalKey,
    contentType: 'image/jpeg',
    status: 'processing',
  });
  r2.set(originalKey, bytes);
  return { projectId: project.id, imageId: image.id };
}

async function reload(imageId: string) {
  const [row] = await db
    .select()
    .from(schema.projectImage)
    .where(eq(schema.projectImage.id, imageId));
  return row!;
}

let representative: Buffer;
let large: Buffer;

beforeAll(async () => {
  representative = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .jpeg()
    .toBuffer();
  large = await sharp({
    create: { width: 4000, height: 3000, channels: 3, background: { r: 200, g: 60, b: 60 } },
  })
    .jpeg()
    .toBuffer();
});

beforeEach(() => r2.clear());

describe('media pipeline (integration)', () => {
  it('processes a representative image to ready with derivatives + phash', async () => {
    const { projectId, imageId } = await seedProcessing(representative);

    const result = await processMedia(job(imageId));
    expect(result).toEqual({ ok: true, derivatives: 8 });

    const row = await reload(imageId);
    expect(row.status).toBe('ready');
    expect(row.width).toBe(1600);
    expect(row.height).toBe(1200);
    expect(row.phash).toMatch(/^[0-9a-f]{16}$/);
    expect(row.derivatives).toHaveLength(8);
    expect(row.derivatives.map((d) => d.format).sort()).toEqual(
      ['avif', 'avif', 'avif', 'avif', 'webp', 'webp', 'webp', 'webp'],
    );

    // Every derivative object was written to R2 and is EXIF-stripped, correctly encoded.
    for (const d of row.derivatives) {
      const key = `derivatives/${projectId}/${imageId}/${d.variant}.${d.format}`;
      expect(r2.has(key)).toBe(true);
      const meta = await sharp(r2.get(key)!).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.format).toBe(d.format === 'avif' ? 'heif' : 'webp');
    }
  });

  it('handles a large image within limits (ready, dimensions captured)', async () => {
    const { imageId } = await seedProcessing(large);

    const result = await processMedia(job(imageId));
    expect(result).toEqual({ ok: true, derivatives: 8 });

    const row = await reload(imageId);
    expect(row.status).toBe('ready');
    expect(row.width).toBe(4000);
    expect(row.height).toBe(3000);
  }, 60_000);

  it('marks corrupt bytes failed and writes no derivatives', async () => {
    const { projectId, imageId } = await seedProcessing(Buffer.from('not an image'));

    const result = await processMedia(job(imageId));
    expect(result).toEqual({ ok: false, reason: 'corrupt' });

    expect(await reload(imageId).then((r) => r.status)).toBe('failed');
    expect([...r2.keys()].some((k) => k.startsWith(`derivatives/${projectId}/${imageId}`))).toBe(
      false,
    );
  });

  it('rejects a duplicate of an existing ready image in the same project', async () => {
    const project = await makeProject();
    const originalKey = `originals/${project.id}/dup`;
    await makeProjectImage({
      projectId: project.id,
      status: 'ready',
      phash: await computePhash(representative),
    });
    const image = await makeProjectImage({
      projectId: project.id,
      originalKey,
      contentType: 'image/jpeg',
      status: 'processing',
    });
    r2.set(originalKey, representative);

    const result = await processMedia(job(image.id));
    expect(result).toEqual({ ok: false, reason: 'duplicate' });
    expect(await reload(image.id).then((r) => r.status)).toBe('failed');
  });
});
