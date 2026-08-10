import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('saved project routes', () => {
  it('saves and removes a project idempotently', async () => {
    const visitor = await createRoleSession('+919800005101', 'visitor');
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    for (const method of ['PUT', 'PUT'] as const) {
      const response = await app.request(`/api/saved-projects/${project.id}`, {
        method,
        headers: { cookie: visitor.cookie },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ projectId: project.id, saved: true });
    }

    const savedRows = await db
      .select()
      .from(schema.savedProject)
      .where(eq(schema.savedProject.userId, visitor.userId));
    expect(savedRows).toHaveLength(1);

    for (const method of ['DELETE', 'DELETE'] as const) {
      const response = await app.request(`/api/saved-projects/${project.id}`, {
        method,
        headers: { cookie: visitor.cookie },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ projectId: project.id, saved: false });
    }
  });

  it('returns saved state only for the authenticated user', async () => {
    const firstVisitor = await createRoleSession('+919800005102', 'visitor');
    const secondVisitor = await createRoleSession('+919800005103', 'visitor');
    const designer = await makeDesigner({ status: 'active' });
    const firstProject = await makeProject({ designerId: designer.id, status: 'published' });
    const secondProject = await makeProject({ designerId: designer.id, status: 'published' });

    await app.request(`/api/saved-projects/${firstProject.id}`, {
      method: 'PUT',
      headers: { cookie: firstVisitor.cookie },
    });
    await app.request(`/api/saved-projects/${secondProject.id}`, {
      method: 'PUT',
      headers: { cookie: secondVisitor.cookie },
    });

    const query = new URLSearchParams();
    query.append('projectIds', firstProject.id);
    query.append('projectIds', secondProject.id);
    const response = await app.request(`/api/saved-projects/state?${query.toString()}`, {
      headers: { cookie: firstVisitor.cookie },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ savedProjectIds: [firstProject.id] });
  });

  it('rejects draft projects and projects owned by inactive designers', async () => {
    const visitor = await createRoleSession('+919800005104', 'visitor');
    const activeDesigner = await makeDesigner({ status: 'active' });
    const inactiveDesigner = await makeDesigner({ status: 'draft' });
    const draftProject = await makeProject({ designerId: activeDesigner.id, status: 'draft' });
    const inactiveProject = await makeProject({
      designerId: inactiveDesigner.id,
      status: 'published',
    });

    for (const projectId of [draftProject.id, inactiveProject.id]) {
      const response = await app.request(`/api/saved-projects/${projectId}`, {
        method: 'PUT',
        headers: { cookie: visitor.cookie },
      });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'not_found' } });
    }
  });

  it('requires authentication and validates the bounded state query', async () => {
    const project = await makeProject();
    expect(
      (await app.request(`/api/saved-projects/${project.id}`, { method: 'PUT' })).status,
    ).toBe(401);
    expect(
      (await app.request(`/api/saved-projects/${project.id}`, { method: 'DELETE' })).status,
    ).toBe(401);
    expect((await app.request(`/api/saved-projects/state?projectIds=${project.id}`)).status).toBe(
      401,
    );

    const visitor = await createRoleSession('+919800005105', 'visitor');
    const single = await app.request(`/api/saved-projects/state?projectIds=${project.id}`, {
      headers: { cookie: visitor.cookie },
    });
    expect(single.status).toBe(200);
    await expect(single.json()).resolves.toEqual({ savedProjectIds: [] });

    const tooMany = new URLSearchParams();
    for (let index = 0; index < 49; index += 1) tooMany.append('projectIds', project.id);
    const invalid = await app.request(`/api/saved-projects/state?${tooMany.toString()}`, {
      headers: { cookie: visitor.cookie },
    });
    expect(invalid.status).toBe(422);
  });

  it('returns documented 403 responses for a banned account', async () => {
    const visitor = await createRoleSession('+919800005106', 'visitor');
    const project = await makeProject();
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, visitor.userId));

    const save = await app.request(`/api/saved-projects/${project.id}`, {
      method: 'PUT',
      headers: { cookie: visitor.cookie },
    });
    expect(save.status).toBe(403);

    const remove = await app.request(`/api/saved-projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie: visitor.cookie },
    });
    expect(remove.status).toBe(403);

    const state = await app.request(`/api/saved-projects/state?projectIds=${project.id}`, {
      headers: { cookie: visitor.cookie },
    });
    expect(state.status).toBe(403);
  });
});
