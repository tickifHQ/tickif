import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createAuthedSession } from '../../helpers/auth.js';

const client = testClient(app);

describe('GET /api/projects', () => {
  it('returns published projects from the DB', async () => {
    const designer = await makeDesigner();
    await makeProject({ designerId: designer.id, title: 'Sunlit Bandra Apartment' });

    const res = await client.api.projects.$get({ query: {} });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ title: 'Sunlit Bandra Apartment', status: 'published' });
  });

  it('filters by status', async () => {
    const designer = await makeDesigner();
    await makeProject({ designerId: designer.id, status: 'draft' });

    const res = await client.api.projects.$get({ query: { status: 'published' } });
    const body = await res.json();
    expect(body.total).toBe(0);
  });
});

describe('POST /api/projects', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const designer = await makeDesigner();
    const res = await client.api.projects.$post({
      json: { designerId: designer.id, title: 'New Project' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a project for an authenticated user (201)', async () => {
    const designer = await makeDesigner();
    const { cookie } = await createAuthedSession();

    const res = await client.api.projects.$post(
      { json: { designerId: designer.id, title: 'Authenticated Project' } },
      { headers: { cookie } },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ title: 'Authenticated Project', status: 'draft' });
    expect(body.slug).toBe('authenticated-project');
  });
});
