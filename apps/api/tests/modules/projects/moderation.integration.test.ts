import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  ErrorResponse,
  ModerationHistoryResponse,
  ProjectDetailResponse,
} from '@repo/contracts';
import { db, schema } from '@repo/db';
import {
  makeDesigner,
  makeUser,
  makeProject,
  makeProjectImage,
  makeProjectRoom,
} from '@repo/db/testing';
import { app } from '../../../src/app.js';
import { projectsRepository } from '../../../src/modules/projects/repository.js';
import { transitionProject } from '../../../src/modules/projects/service.js';
import { createRoleSession } from '../../helpers/auth.js';

async function makeDesignerSession(phoneNumber: string) {
  const { cookie, userId } = await createRoleSession(phoneNumber, 'designer');
  const designer = await makeDesigner({ userId });
  await db.insert(schema.member).values({
    id: `mem-${userId}`,
    organizationId: designer.orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { cookie, userId, designer };
}

describe('project moderation transitions', () => {
  it('withdraws a submitted project, clears submittedAt, and records masked history', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002081');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date('2026-07-23T10:00:00.000Z'),
    });

    const withdraw = await app.request(`/api/projects/${project.id}/withdraw`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(withdraw.status).toBe(200);
    const withdrawn = (await withdraw.json()) as ProjectDetailResponse;
    expect(withdrawn).toMatchObject({
      id: project.id,
      status: 'draft',
      submittedAt: null,
    });

    const history = await app.request(`/api/projects/${project.id}/moderation-history`, {
      headers: { cookie },
    });
    expect(history.status).toBe(200);
    const body = (await history.json()) as ModerationHistoryResponse;
    expect(body.items).toEqual([
      expect.objectContaining({
        action: 'withdraw',
        fromStatus: 'submitted',
        toStatus: 'draft',
        actorLabel: 'Tickif Review Team',
      }),
    ]);
    expect(body.items[0]).not.toHaveProperty('actorUserId');
  });

  it('allows exactly one of two concurrent withdrawals', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002082');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });

    const responses = await Promise.all([
      app.request(`/api/projects/${project.id}/withdraw`, {
        method: 'POST',
        headers: { cookie },
      }),
      app.request(`/api/projects/${project.id}/withdraw`, {
        method: 'POST',
        headers: { cookie },
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const conflict = responses.find((response) => response.status === 409);
    const body = (await conflict?.json()) as ErrorResponse;
    expect(body.error.code).toBe('invalid_transition');

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(1);
  });

  it('allows exactly one of two concurrent submissions', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002086');
    const project = await makeProject({
      designerId: designer.id,
      status: 'draft',
      citySlug: 'mumbai',
      propertyTypeSlug: 'residential',
      scopeSlug: 'full-home',
      budgetBandSlug: 'premium',
    });
    const room = await makeProjectRoom({ projectId: project.id });
    for (let index = 0; index < 3; index += 1) {
      await makeProjectImage({
        projectId: project.id,
        roomId: room.id,
        status: 'ready',
        themeSlugs: ['modern'],
        finishSlugs: ['veneer'],
      });
    }

    const responses = await Promise.all([
      app.request(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { cookie },
      }),
      app.request(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { cookie },
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toEqual([
      expect.objectContaining({
        action: 'submit',
        fromStatus: 'draft',
        toStatus: 'submitted',
      }),
    ]);
  });

  it('rolls back the status update when the audit insert fails', async () => {
    const { designer } = await makeDesignerSession('+919800002083');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });

    await expect(
      projectsRepository.transition({
        id: project.id,
        fromStatus: 'submitted',
        toStatus: 'draft',
        actorUserId: 'missing-user',
        action: 'withdraw',
        patch: { submittedAt: null },
      }),
    ).rejects.toThrow();

    const [persisted] = await db
      .select()
      .from(schema.project)
      .where(eq(schema.project.id, project.id));
    expect(persisted).toMatchObject({
      status: 'submitted',
      submittedAt: expect.any(Date),
    });

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(0);
  });

  it('records publish and unpublish projection events in transition order', async () => {
    const actor = await makeUser();
    const designer = await makeDesigner({ userId: actor.id, status: 'active' });
    const project = await makeProject({
      designerId: designer.id,
      status: 'in_review',
      publishedAt: null,
    });

    await transitionProject(
      {
        projectId: project.id,
        toStatus: 'published',
        patch: { publishedAt: new Date('2026-07-28T12:00:00.000Z') },
      },
      { userId: actor.id, userRole: 'admin' },
    );
    await transitionProject(
      {
        projectId: project.id,
        toStatus: 'in_review',
        patch: { publishedAt: null },
      },
      { userId: actor.id, userRole: 'admin' },
    );

    const events = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .orderBy(schema.searchProjectionOutbox.sequence);
    expect(
      events.map(({ entityKind, entityId, operation }) => ({
        entityKind,
        entityId,
        operation,
      })),
    ).toEqual([
      { entityKind: 'project', entityId: project.id, operation: 'index' },
      { entityKind: 'designer', entityId: designer.id, operation: 'index' },
      { entityKind: 'project', entityId: project.id, operation: 'delete' },
      { entityKind: 'designer', entityId: designer.id, operation: 'index' },
    ]);
  });

  it('rejects history reads by a different designer', async () => {
    const owner = await makeDesignerSession('+919800002084');
    const stranger = await makeDesignerSession('+919800002085');
    const project = await makeProject({ designerId: owner.designer.id, status: 'submitted' });

    const response = await app.request(`/api/projects/${project.id}/moderation-history`, {
      headers: { cookie: stranger.cookie },
    });
    expect(response.status).toBe(403);
  });

  it('allows deleting a project whose only history is the designer submitting and withdrawing', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002087');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });
    const withdraw = await app.request(`/api/projects/${project.id}/withdraw`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(withdraw.status).toBe(200);

    // No reviewer ever saw this project, so there is no verdict to retain — blocking here
    // stranded the draft permanently, with nothing able to clear it.
    const deletion = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(deletion.status).toBe(200);

    const [rows, events] = await Promise.all([
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
      db
        .select()
        .from(schema.projectModerationEvent)
        .where(eq(schema.projectModerationEvent.projectId, project.id)),
    ]);
    expect(rows).toHaveLength(0);
    expect(events).toHaveLength(0);
    const projectionEvents = await db
      .select()
      .from(schema.searchProjectionOutbox)
      .where(eq(schema.searchProjectionOutbox.entityId, project.id));
    expect(projectionEvents).toEqual([
      expect.objectContaining({
        entityKind: 'project',
        operation: 'delete',
      }),
    ]);
  });

  it('still refuses to delete a project once a reviewer has acted on it', async () => {
    const { cookie, designer } = await makeDesignerSession('+919800002090');
    const admin = await makeUser();
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });
    const adminCaller = { userId: admin.id, userRole: 'admin' };
    await transitionProject({ projectId: project.id, toStatus: 'in_review' }, adminCaller);
    // Ends on changes_requested, which is editable — so the delete reaches the retention
    // check rather than being turned away for the project's status.
    await transitionProject(
      { projectId: project.id, toStatus: 'changes_requested', note: 'Add room labels.' },
      adminCaller,
    );

    const deletion = await app.request(`/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(deletion.status).toBe(409);

    const [rows, events] = await Promise.all([
      db.select().from(schema.project).where(eq(schema.project.id, project.id)),
      db
        .select()
        .from(schema.projectModerationEvent)
        .where(eq(schema.projectModerationEvent.projectId, project.id)),
    ]);
    expect(rows).toHaveLength(1);
    expect(events.map((event) => event.action)).toEqual(['start_review', 'request_changes']);
  });

  it('lets a superadmin withdraw a submitted project', async () => {
    const { designer } = await makeDesignerSession('+919800002091');
    const superadmin = await createRoleSession('+919800002092', 'superadmin');
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });

    const withdraw = await app.request(`/api/projects/${project.id}/withdraw`, {
      method: 'POST',
      headers: { cookie: superadmin.cookie },
    });
    expect(withdraw.status).toBe(200);
    expect((await withdraw.json()) as ProjectDetailResponse).toMatchObject({
      status: 'draft',
      submittedAt: null,
    });

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events.map((event) => event.action)).toEqual(['withdraw']);
  });

  // Schema-level guarantee, so this drives the repository directly rather than the HTTP
  // + OTP path — no session is needed to prove what the foreign key does.
  it('keeps the audit row and anonymizes the actor when the acting user is deleted', async () => {
    const actor = await makeUser();
    const designer = await makeDesigner({ userId: actor.id });
    const project = await makeProject({
      designerId: designer.id,
      status: 'submitted',
      submittedAt: new Date(),
    });
    const withdrawn = await projectsRepository.transition({
      id: project.id,
      fromStatus: 'submitted',
      toStatus: 'draft',
      actorUserId: actor.id,
      action: 'withdraw',
    });
    expect(withdrawn).not.toBeNull();

    // Account closure / GDPR erasure must not be blocked by the audit trail, and must not
    // take the audit row with it — the FK is ON DELETE SET NULL, not RESTRICT.
    // `designer_profile.user_id` nulls on the same delete, so this needs no cleanup.
    await db.delete(schema.user).where(eq(schema.user.id, actor.id));

    const events = await db
      .select()
      .from(schema.projectModerationEvent)
      .where(eq(schema.projectModerationEvent.projectId, project.id));
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('withdraw');
    expect(events[0]?.actorUserId).toBeNull();
  });
});
