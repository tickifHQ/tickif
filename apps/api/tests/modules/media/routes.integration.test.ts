import { describe, it, expect, vi } from 'vitest';
import { testClient } from 'hono/testing';
import { db, schema, desc, eq } from '@repo/db';
import {
  makeDesigner,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
  makeTaxonomy,
} from '@repo/db/testing';
import type * as queueModule from '@repo/queue';
import type * as storageModule from '@repo/storage';
import { app } from '../../../src/app.js';
import { createAuthedSession } from '../../helpers/auth.js';

// Keep the lazy queue real but never touch Redis from these HTTP tests.
vi.mock('@repo/queue', async (orig) => ({
  ...(await orig<typeof queueModule>()),
  enqueueMedia: vi.fn(async () => {}),
  enqueueSms: vi.fn(async () => {}),
}));

// Real presign (local signing), but commit's existence check never hits R2.
vi.mock('@repo/storage', async (orig) => ({
  ...(await orig<typeof storageModule>()),
  objectExists: vi.fn(async () => true),
}));

const client = testClient(app);

/** The user id behind the most recent session (one exists per test after truncateAll). */
async function sessionUserId(): Promise<string> {
  const [row] = await db
    .select({ userId: schema.session.userId })
    .from(schema.session)
    .orderBy(desc(schema.session.createdAt))
    .limit(1);
  if (!row) throw new Error('no session found');
  return row.userId;
}

const RANDOM_UUID = '99999999-9999-4999-8999-999999999999';

describe('POST /api/media/upload-url', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.media['upload-url'].$post({
      json: { projectId: RANDOM_UUID, contentType: 'image/jpeg', size: 1000 },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid content type with 422', async () => {
    const { cookie } = await createAuthedSession();
    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: RANDOM_UUID, contentType: 'image/gif' } as never },
      { headers: { cookie } },
    );
    expect(res.status).toBe(422);
  });

  it('404s when the project does not exist', async () => {
    const { cookie } = await createAuthedSession();
    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: RANDOM_UUID, contentType: 'image/jpeg', size: 1000 } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  it('403s when the caller does not own the project', async () => {
    const { cookie } = await createAuthedSession();
    const otherDesigner = await makeDesigner();
    const project = await makeProject({ designerId: otherDesigner.id });

    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: project.id, contentType: 'image/jpeg', size: 1000 } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(403);
  });

  it('mints a presigned url and creates a processing row for the owner (201)', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: project.id, contentType: 'image/jpeg', size: 1000 } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    if (res.status !== 201) throw new Error('expected 201');
    const body = await res.json();
    expect(body.key).toMatch(new RegExp(`^originals/${project.id}/`));
    expect(body.uploadUrl).toContain('X-Amz-Signature');

    const [row] = await db
      .select()
      .from(schema.projectImage)
      .where(eq(schema.projectImage.id, body.imageId));
    expect(row).toBeDefined();
    expect(row!.status).toBe('processing');
    expect(row!.originalKey).toBe(body.key);
    expect(row!.projectId).toBe(project.id);
  });
});

describe('POST /api/media/:imageId/commit', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.media[':imageId'].commit.$post({ param: { imageId: RANDOM_UUID } });
    expect(res.status).toBe(401);
  });

  it('404s for a missing image', async () => {
    const { cookie } = await createAuthedSession();
    const res = await client.api.media[':imageId'].commit.$post(
      { param: { imageId: RANDOM_UUID } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  it('accepts (202) and reports processing for the owner', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id });

    const res = await client.api.media[':imageId'].commit.$post(
      { param: { imageId: image.id } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(202);
    if (res.status !== 202) throw new Error('expected 202');
    expect(await res.json()).toEqual({ imageId: image.id, status: 'processing' });
  });
});

describe('GET /api/projects/:id/images', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.projects[':id'].images.$get({
      param: { id: RANDOM_UUID },
      query: {},
    });
    expect(res.status).toBe(401);
  });

  it('403s for a non-owner', async () => {
    const { cookie } = await createAuthedSession();
    const other = await makeDesigner();
    const project = await makeProject({ designerId: other.id });
    const res = await client.api.projects[':id'].images.$get(
      { param: { id: project.id }, query: {} },
      { headers: { cookie } },
    );
    expect(res.status).toBe(403);
  });

  it('returns the owner’s images ordered by sortOrder with status + derivatives', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id });
    await makeProjectImage({ projectId: project.id, sortOrder: 1, status: 'processing' });
    await makeProjectImage({
      projectId: project.id,
      sortOrder: 0,
      status: 'ready',
      width: 1600,
      height: 1200,
      derivatives: [{ variant: 'thumb', format: 'webp', key: 'd/t.webp', width: 320, height: 240 }],
    });

    const res = await client.api.projects[':id'].images.$get(
      { param: { id: project.id }, query: {} },
      { headers: { cookie } },
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error('expected 200');
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]!.sortOrder).toBe(0);
    expect(body.items[0]!.status).toBe('ready');
    expect(body.items[0]!.derivatives).toHaveLength(1);
    expect(body.items[0]!.previewUrl).toContain('X-Amz-Signature=');
    expect(body.items[0]).toMatchObject({
      roomId: null,
      themeSlugs: [],
      materialSlugs: [],
      finishSlugs: [],
      tagSlugs: [],
    });
    expect(body.items[1]!.status).toBe('processing');
    expect(body.items[1]!.previewUrl).toBeNull();
  });
});

describe('PATCH /api/media/:imageId/metadata', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const res = await client.api.media[':imageId'].metadata.$patch({
      param: { imageId: RANDOM_UUID },
      json: { tagSlugs: ['hero'] },
    });

    expect(res.status).toBe(401);
  });

  it('403s for a non-owner', async () => {
    const { cookie } = await createAuthedSession();
    const other = await makeDesigner();
    const project = await makeProject({ designerId: other.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: { tagSlugs: ['hero'] },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(403);
  });

  it('409s when metadata is changed after the project leaves draft', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: { tagSlugs: ['hero'] },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(409);
  });

  it('updates metadata while changes are requested', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'changes_requested' });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: { tagSlugs: ['hero'] },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error('expected 200');
    expect(await res.json()).toMatchObject({ id: image.id, tagSlugs: ['hero'] });
  });

  it('updates room and taxonomy metadata for an owned image', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const room = await makeProjectRoom({ projectId: project.id });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });
    await makeTaxonomy({ kind: 'theme', slug: 'modern', label: 'Modern' });
    await makeTaxonomy({ kind: 'material', slug: 'wood', label: 'Wood' });
    await makeTaxonomy({ kind: 'finish', slug: 'veneer', label: 'Veneer' });

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: {
          roomId: room.id,
          sortOrder: 4,
          themeSlugs: ['modern'],
          materialSlugs: ['wood'],
          finishSlugs: ['veneer'],
          tagSlugs: ['hero'],
        },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error('expected 200');
    expect(await res.json()).toMatchObject({
      id: image.id,
      roomId: room.id,
      sortOrder: 4,
      themeSlugs: ['modern'],
      materialSlugs: ['wood'],
      finishSlugs: ['veneer'],
      tagSlugs: ['hero'],
    });
  });

  it('rejects unknown managed taxonomy metadata', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: { themeSlugs: ['not-real'] },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(422);
  });

  it('rejects room ids from another project', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id, status: 'draft' });
    const image = await makeProjectImage({ projectId: project.id, status: 'ready' });
    const otherRoom = await makeProjectRoom();

    const res = await client.api.media[':imageId'].metadata.$patch(
      {
        param: { imageId: image.id },
        json: { roomId: otherRoom.id },
      },
      { headers: { cookie } },
    );

    expect(res.status).toBe(422);
  });
});
