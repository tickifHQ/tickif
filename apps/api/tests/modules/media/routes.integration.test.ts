import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { db, schema, desc, eq } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createAuthedSession } from '../../helpers/auth.js';

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
      json: { projectId: RANDOM_UUID, contentType: 'image/jpeg' },
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
      { json: { projectId: RANDOM_UUID, contentType: 'image/jpeg' } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });

  it('403s when the caller does not own the project', async () => {
    const { cookie } = await createAuthedSession();
    const otherDesigner = await makeDesigner();
    const project = await makeProject({ designerId: otherDesigner.id });

    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: project.id, contentType: 'image/jpeg' } },
      { headers: { cookie } },
    );
    expect(res.status).toBe(403);
  });

  it('mints a presigned url and creates a processing row for the owner (201)', async () => {
    const { cookie } = await createAuthedSession();
    const designer = await makeDesigner({ userId: await sessionUserId() });
    const project = await makeProject({ designerId: designer.id });

    const res = await client.api.media['upload-url'].$post(
      { json: { projectId: project.id, contentType: 'image/jpeg' } },
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
