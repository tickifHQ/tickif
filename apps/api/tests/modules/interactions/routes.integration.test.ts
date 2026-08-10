import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, db, eq, inArray, schema } from '@repo/db';
import { makeDesigner, makeProject } from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { createRoleSession } from '../../helpers/auth.js';

describe('POST /api/interactions/views', () => {
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
