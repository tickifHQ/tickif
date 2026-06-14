import { describe, it, expect } from 'vitest';
import { db, schema, eq } from '@repo/db';
import { makeProject, makeProjectImage } from '@repo/db/testing';

describe('project_image model (E-105)', () => {
  it('defaults status to processing and persists the new columns', async () => {
    const project = await makeProject();
    const image = await makeProjectImage({ projectId: project.id });

    expect(image.status).toBe('processing');
    expect(image.originalKey).toMatch(/.+/);
    expect(image.sortOrder).toBe(0);
    expect(image.derivatives).toEqual([]);
    expect(image.roomId).toBeNull();
    expect(image.createdAt).toBeInstanceOf(Date);
    expect(image.updatedAt).toBeInstanceOf(Date);
  });

  it('round-trips derivatives jsonb and ready status', async () => {
    const project = await makeProject();
    const derivatives = [
      { variant: 'thumb', format: 'webp', key: 'd/thumb.webp', width: 320, height: 240 },
      { variant: 'full', format: 'avif', key: 'd/full.avif', width: 1600, height: 1200 },
    ];
    const image = await makeProjectImage({
      projectId: project.id,
      status: 'ready',
      phash: 'ffffffffffffffff',
      width: 1600,
      height: 1200,
      sortOrder: 3,
      derivatives,
    });

    const [row] = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.id, image.id));

    expect(row).toBeDefined();
    expect(row!.status).toBe('ready');
    expect(row!.phash).toBe('ffffffffffffffff');
    expect(row!.derivatives).toEqual(derivatives);
    expect(row!.sortOrder).toBe(3);
  });

  it('cascades delete when the parent project is removed', async () => {
    const project = await makeProject();
    const image = await makeProjectImage({ projectId: project.id });

    await db.delete(schema.project).where(eq(schema.project.id, project.id));

    const rows = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.id, image.id));
    expect(rows).toHaveLength(0);
  });
});
