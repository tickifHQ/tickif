import { describe, expect, it } from 'vitest';
import { db, eq, schema } from '@repo/db';
import { makeDesigner, makeProject, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { projectLikesRepository } from '../../../src/modules/project-likes/repository.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('project likes routes', () => {
  it('persists idempotent likes separately from bookmarks and exposes no identities', async () => {
    const visitor = await createRoleSession('+919800007101', 'visitor');
    const other = await createRoleSession('+919800007102', 'visitor');
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    for (let index = 0; index < 2; index++) {
      const response = await app.request(`/api/project-likes/${project.id}`, { method: 'PUT', headers: { cookie: visitor.cookie } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ projectId: project.id, liked: true, likeCount: 1 });
    }
    expect(await db.select().from(schema.savedProject)).toEqual([]);
    for (const [cookie, liked] of [[visitor.cookie, true], [other.cookie, false], ['', false]] as const) {
      const response = await app.request(`/api/project-likes/state?projectIds=${project.id}`, { headers: { cookie } });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ projects: [{ projectId: project.id, liked, likeCount: 1 }] });
    }
    await db.insert(schema.savedProject).values({ userId: visitor.userId, projectId: project.id });
    for (let index = 0; index < 2; index++) {
      const response = await app.request(`/api/project-likes/${project.id}`, { method: 'DELETE', headers: { cookie: visitor.cookie } });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ projectId: project.id, liked: false, likeCount: 0 });
    }
    expect(await db.select().from(schema.savedProject)).toHaveLength(1);
  });

  it('serializes concurrent retries and different visitors without losing counts', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const visitors = await Promise.all(Array.from({ length: 5 }, () => makeUser()));
    const results = await Promise.all(visitors.flatMap((visitor) => [
      projectLikesRepository.setLiked(visitor.id, project.id, true),
      projectLikesRepository.setLiked(visitor.id, project.id, true),
    ]));
    expect(results.every((state) => state?.liked && state.likeCount >= 1 && state.likeCount <= 5)).toBe(true);
    expect(await projectLikesRepository.state(null, [project.id])).toEqual([{ projectId: project.id, liked: false, likeCount: 5 }]);
    await Promise.all(visitors.flatMap((visitor) => [
      projectLikesRepository.setLiked(visitor.id, project.id, false),
      projectLikesRepository.setLiked(visitor.id, project.id, false),
    ]));
    expect(await projectLikesRepository.state(null, [project.id])).toEqual([{ projectId: project.id, liked: false, likeCount: 0 }]);
  });

  it('hides unpublished projects and inactive designers on both reads and writes', async () => {
    const visitor = await createRoleSession('+919800007103', 'visitor');
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    await projectLikesRepository.setLiked(visitor.userId, project.id, true);
    for (const reason of ['unpublished', 'inactive'] as const) {
      await db.update(schema.project).set({ status: reason === 'unpublished' ? 'draft' : 'published' }).where(eq(schema.project.id, project.id));
      await db.update(schema.designerProfile).set({ status: reason === 'inactive' ? 'suspended' : 'active' }).where(eq(schema.designerProfile.id, designer.id));
      for (const method of ['PUT', 'DELETE']) {
        const response = await app.request(`/api/project-likes/${project.id}`, { method, headers: { cookie: visitor.cookie } });
        expect(response.status).toBe(404);
      }
      const read = await app.request(`/api/project-likes/state?projectIds=${project.id}`, { headers: { cookie: visitor.cookie } });
      expect(await read.json()).toEqual({ projects: [] });
    }
  });

  it('guards mutations, validates input, and rejects banned sessions', async () => {
    const visitor = await createRoleSession('+919800007104', 'visitor');
    const project = await makeProject();
    for (const method of ['PUT', 'DELETE']) {
      expect((await app.request(`/api/project-likes/${project.id}`, { method })).status).toBe(401);
      expect((await app.request('/api/project-likes/not-a-uuid', { method, headers: { cookie: visitor.cookie } })).status).toBe(422);
    }
    expect((await app.request('/api/project-likes/state?projectIds=invalid')).status).toBe(422);
    const query = new URLSearchParams();
    for (let index = 0; index < 49; index++) query.append('projectIds', project.id);
    expect((await app.request(`/api/project-likes/state?${query}`)).status).toBe(422);
    await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, visitor.userId));
    for (const method of ['PUT', 'DELETE']) {
      expect((await app.request(`/api/project-likes/${project.id}`, { method, headers: { cookie: visitor.cookie } })).status).toBe(403);
    }
  });

  it('requires personal context for organization members', async () => {
    const account = await createRoleSession('+919800007105', 'designer');
    const designer = await makeDesigner({ userId: account.userId, status: 'active' });
    await db.insert(schema.member).values({ id: 'like-owner', userId: account.userId, organizationId: designer.orgId, role: 'owner', createdAt: new Date() });
    await db.update(schema.session).set({ activeOrganizationId: designer.orgId, activeTeamId: designer.teamId }).where(eq(schema.session.userId, account.userId));
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    for (const method of ['PUT', 'DELETE']) {
      const response = await app.request(`/api/project-likes/${project.id}`, { method, headers: { cookie: account.cookie } });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { message: 'Switch to personal context to continue' } });
    }
  });

  it('cascades likes when a visitor or project is deleted', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const first = await makeUser();
    const second = await makeUser();
    await projectLikesRepository.setLiked(first.id, project.id, true);
    await projectLikesRepository.setLiked(second.id, project.id, true);
    await db.delete(schema.user).where(eq(schema.user.id, first.id));
    expect(await projectLikesRepository.state(null, [project.id])).toEqual([{ projectId: project.id, liked: false, likeCount: 1 }]);
    await db.delete(schema.project).where(eq(schema.project.id, project.id));
    expect(await db.select().from(schema.projectLike)).toEqual([]);
  });
});
