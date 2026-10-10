import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, db, eq, inArray, schema } from '@repo/db';
import { makeDesigner, makeProject, makeUser } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('POST /api/interactions/views', () => {
  it('increments totals only for inserted daily views and retains them after event purging', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const actor = await makeUser();
    const input = {
      type: 'project_view' as const,
      projectId: project.id,
      actorUserId: actor.id,
      anonymousId: randomUUID(),
    };
    await Promise.all(
      Array.from({ length: 6 }, () =>
        db
          .insert(schema.interactionEvent)
          .values({ ...input, eventKey: randomUUID() })
          .onConflictDoNothing(),
      ),
    );
    const previousDay = new Date(Date.now() - 86_400_000);
    await db.insert(schema.interactionEvent).values({
      ...input,
      eventKey: randomUUID(),
      createdAt: previousDay,
      eventDay: previousDay.toISOString().slice(0, 10),
    });
    await db.insert(schema.savedProject).values({ projectId: project.id, userId: actor.id });
    const counts = async () =>
      (await app.request(`/api/interactions/projects?projectIds=${project.id}`)).json();
    expect(await counts()).toEqual({
      projects: [{ projectId: project.id, viewCount: 2, saveCount: 1 }],
    });
    await db
      .delete(schema.interactionEvent)
      .where(eq(schema.interactionEvent.projectId, project.id));
    expect(await counts()).toEqual({
      projects: [{ projectId: project.id, viewCount: 2, saveCount: 1 }],
    });
    await db.delete(schema.savedProject).where(eq(schema.savedProject.projectId, project.id));
    expect(await counts()).toEqual({
      projects: [{ projectId: project.id, viewCount: 2, saveCount: 0 }],
    });
    await db.delete(schema.project).where(eq(schema.project.id, project.id));
    expect(
      await db
        .select()
        .from(schema.projectEngagement)
        .where(eq(schema.projectEngagement.projectId, project.id)),
    ).toEqual([]);
  });

  it('bounds public count requests and hides unpublished projects and inactive designers', async () => {
    const active = await makeDesigner({ status: 'active' });
    const suspended = await makeDesigner({ status: 'suspended' });
    const draft = await makeProject({ designerId: active.id, status: 'draft' });
    const hidden = await makeProject({ designerId: suspended.id, status: 'published' });
    const query = new URLSearchParams();
    for (const id of [draft.id, hidden.id, randomUUID()]) query.append('projectIds', id);
    expect(await (await app.request(`/api/interactions/projects?${query}`)).json()).toEqual({
      projects: [],
    });
    expect((await app.request('/api/interactions/projects?projectIds=invalid')).status).toBe(422);
    const excessive = new URLSearchParams();
    for (let i = 0; i < 49; i++) excessive.append('projectIds', randomUUID());
    expect((await app.request(`/api/interactions/projects?${excessive}`)).status).toBe(422);
  });

  it('no longer exposes like endpoints', async () => {
    expect((await app.request('/api/project-likes/state')).status).toBe(404);
    for (const method of ['PUT', 'DELETE']) {
      expect((await app.request(`/api/project-likes/${randomUUID()}`, { method })).status).toBe(
        404,
      );
    }
  });
  it('exposes public project counts without exposing visitor identities', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const response = await app.request(`/api/interactions/projects?projectIds=${project.id}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [{ projectId: project.id, viewCount: 0, saveCount: 0 }],
    });
  });
  it('records an authenticated public-project view idempotently', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });
    const { cookie, userId } = await createRoleSession('+919800004019', 'visitor');
    const payload = {
      type: 'project_view',
      eventKey: randomUUID(),
      anonymousId: randomUUID(),
      projectId: project.id,
    } as const;

    const first = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload),
    });
    const replay = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload),
    });
    const sameDayDuplicate = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        ...payload,
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
      }),
    });

    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ recorded: true });
    expect(replay.status).toBe(202);
    expect(await replay.json()).toEqual({ recorded: false });
    expect(sameDayDuplicate.status).toBe(202);
    expect(await sameDayDuplicate.json()).toEqual({ recorded: false });

    const rows = await db
      .select()
      .from(schema.interactionEvent)
      .where(
        and(
          eq(schema.interactionEvent.actorUserId, userId),
          eq(schema.interactionEvent.projectId, project.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(
      await (await app.request(`/api/interactions/projects?projectIds=${project.id}`)).json(),
    ).toEqual({
      projects: [{ projectId: project.id, viewCount: 1, saveCount: 0 }],
    });
    expect(rows[0]).toMatchObject({
      type: 'project_view',
      anonymousId: payload.anonymousId,
      actorUserId: userId,
      projectId: project.id,
      designerProfileId: null,
    });
  });

  it('requires authentication before accepting an event', async () => {
    const response = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: randomUUID(),
      }),
    });

    expect(response.status).toBe(401);
  });

  it('records the authenticated actor alongside the anonymous identity', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const { cookie, userId } = await createRoleSession('+919800004020', 'visitor');
    const payload = {
      type: 'profile_view',
      eventKey: randomUUID(),
      anonymousId: randomUUID(),
      designerProfileId: designer.id,
    } as const;

    const response = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ recorded: true });
    const [row] = await db
      .select({ actorUserId: schema.interactionEvent.actorUserId })
      .from(schema.interactionEvent)
      .where(eq(schema.interactionEvent.eventKey, payload.eventKey));
    expect(row?.actorUserId).toBe(userId);
  });

  it('does not count views from a member of the target organization', async () => {
    const { cookie, userId } = await createRoleSession('+919800004023', 'designer');
    const designer = await makeDesigner({ userId, status: 'active' });
    await db.insert(schema.member).values({
      id: `mem-interactions-${userId}`,
      organizationId: designer.orgId,
      userId,
      role: 'owner',
      createdAt: new Date(),
    });
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    for (const payload of [
      {
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: project.id,
      },
      {
        type: 'profile_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        designerProfileId: designer.id,
      },
    ] as const) {
      const response = await app.request('/api/interactions/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ recorded: false });
    }

    const ownRows = await db
      .select()
      .from(schema.interactionEvent)
      .where(eq(schema.interactionEvent.actorUserId, userId));
    expect(ownRows).toEqual([]);
    expect(
      await (await app.request(`/api/interactions/projects?projectIds=${project.id}`)).json(),
    ).toEqual({
      projects: [{ projectId: project.id, viewCount: 0, saveCount: 0 }],
    });
  });

  it('rejects non-public targets without revealing their lifecycle state', async () => {
    const suspendedDesigner = await makeDesigner({ status: 'suspended' });
    const publishedProject = await makeProject({
      designerId: suspendedDesigner.id,
      status: 'published',
    });
    const { cookie } = await createRoleSession('+919800004021', 'visitor');
    const projectEventKey = randomUUID();
    const profileEventKey = randomUUID();

    const projectResponse = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'project_view',
        eventKey: projectEventKey,
        anonymousId: randomUUID(),
        projectId: publishedProject.id,
      }),
    });
    const profileResponse = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'profile_view',
        eventKey: profileEventKey,
        anonymousId: randomUUID(),
        designerProfileId: suspendedDesigner.id,
      }),
    });

    expect(projectResponse.status).toBe(404);
    expect(profileResponse.status).toBe(404);
    const rejectedRows = await db
      .select()
      .from(schema.interactionEvent)
      .where(inArray(schema.interactionEvent.eventKey, [projectEventKey, profileEventKey]));
    expect(rejectedRows).toEqual([]);
  });

  it('rejects mismatched targets and arbitrary metadata at validation', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const { cookie } = await createRoleSession('+919800004022', 'visitor');
    const response = await app.request('/api/interactions/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'profile_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        designerProfileId: designer.id,
        projectId: randomUUID(),
        userAgent: 'must not be stored',
      }),
    });

    expect(response.status).toBe(422);
  });

  it('enforces the typed target invariant at the database boundary', async () => {
    const designer = await makeDesigner({ status: 'active' });
    const project = await makeProject({ designerId: designer.id, status: 'published' });

    await expect(
      db.insert(schema.interactionEvent).values({
        type: 'project_view',
        eventKey: randomUUID(),
        anonymousId: randomUUID(),
        projectId: project.id,
        designerProfileId: designer.id,
      }),
    ).rejects.toThrow();
  });
});
